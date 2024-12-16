import { configDotenv } from "dotenv";
import s3 from "./utils/s3.util.js";
import amqp from "amqplib";
import fs from "node:fs";
import path from "node:path";
import ffmpeg from "fluent-ffmpeg";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import videoModel from "./models/video.model.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
configDotenv({
  path: "./.transcodeService.env",
});
(async () => {
  try {
    const mongoconnection =await mongoose.connect(`${process.env.MONGO_URL}/${process.env.DB_NAME}`)
    console.log("database connection established",`${mongoconnection.connection.host}:${mongoconnection.connection.port}`);
    console.log("transcoder Service is Running");
    const connection = await amqp.connect("amqp://localhost");
    const channel = await connection.createChannel();
    const queue = "video_queue";
    await channel.assertQueue(queue, { durable: true });
    channel.prefetch(1);
    channel.consume(queue, async (message) => {
      if (message.content) {
        try {
          const data = JSON.parse(message.content.toString());
          console.log(data, "transcoder service message recieved");
          const inputFilePath = await downloadRawVideoFromS3(data.key);
          const hlsOutputDir = await transcodeToHLS(inputFilePath,data.key);
          console.log(hlsOutputDir, "hls Output dir");

          uploadToS3(hlsOutputDir, data.key,data);

          console.log("HLS files uploaded successfully to target bucket");
          channel.ack(message);
          // Cleanup temporary files
          deleteRawVideoFromS3(data.key);
          fs.unlinkSync(inputFilePath);

          console.log("Temporary files cleaned up");
        } catch (error) {
          console.error(error);
          channel.nack(message, false, false);
        }
      }
    });
  } catch (error) {
    console.error(error);
  }
})();
async function downloadRawVideoFromS3(key) {
  const s3Params = { Key: key, Bucket: process.env.AWS_S3_BUCKET_RAW_VIDEO };
  const filePath = path.join(__dirname, "uploads", "rawVideo", key);
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  return new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(filePath);
    s3.getObject(s3Params)
      .createReadStream()
      .on("end", () => {
        console.log("video downloaded successfully");
        resolve(filePath);
      })
      .on("error", reject)
      .pipe(fileStream);
  });
}
async function transcodeToHLS(inputFilePath,videoNameForOutputFile) {
  const resolutions = [
    { name: "360p", width: 640, height: 360, bitrate: "800k" },
    { name: "720p", width: 1280, height: 720, bitrate: "2500k" },
    { name: "1080p", width: 1920, height: 1080, bitrate: "5000k" },
  ];
  let outputDir;
  for (const resolution of resolutions) {
    outputDir = path.join(__dirname, "uploads", "hls",videoNameForOutputFile, resolution.name);
    fs.mkdirSync(outputDir, { recursive: true });
    try {
      const outputPath = path.join(outputDir, `${resolution.name}.m3u8`);
      console.log(`Transcoding to ${resolution.name}...`);
      await new Promise((resolve, reject) => {
        ffmpeg(inputFilePath)
          .outputOptions([
            `-vf scale=${resolution.width}:${resolution.height}`,
            `-b:v ${resolution.bitrate}`,
            "-hls_time 4",
            "-hls_playlist_type vod",
          ])
          .output(outputPath).on('progress',(progress)=>{
            console.log(`processing current video resolution ${resolution.name}....${Math.round(progress.percent)}% frames ${progress.frames}`);
            
          })
          .on("end", resolve)
          .on("error", reject)
          .run();
      });
      console.log("All files transcoded");
      const masterPlaylistPath = path.join(__dirname, "uploads", "hls",videoNameForOutputFile, "index.m3u8");
      const masterPlaylistContent = `
      #EXTM3U
      #EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
      360p/360p.m3u8
      #EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720
      720p/720p.m3u8
      #EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
      1080p/1080p.m3u8
  `.trim() 
  fs.writeFileSync(masterPlaylistPath, masterPlaylistContent)

    } catch (error) {
      console.error("Error during transcoding or uploading:", error);
    }
  }
  return path.join(__dirname, "uploads", "hls",videoNameForOutputFile);
}

const uploadToS3 = (filePathTranscoded, keyprefix,metadata) => {
  // uploadMasterPlaylistToS3(filePathTranscoded, keyprefix)
  const filesAndDirectories = fs.readdirSync(filePathTranscoded);
  for (const fileDir of filesAndDirectories) {
    if (fileDir.endsWith(".m3u8")) {
      const filePath = path.join(filePathTranscoded, fileDir);
      uploadMasterPlaylistToS3(filePath, keyprefix,metadata);
    }else{
      const dirPath = path.join(filePathTranscoded, fileDir);
      const files = fs.readdirSync(dirPath);
      files.forEach((file) => {
        const filePath = path.join(dirPath, file);
        s3
          .upload({
            Bucket: process.env.AWS_S3_BUCKET_TRANSCODED,
            Key: `${keyprefix.split(".")[0].toLowerCase()}/${fileDir}/${file}`,
            Body: fs.createReadStream(filePath),
            ContentType: file.endsWith(".m3u8")
              ? "application/vnd.apple.mpegurl"
              : "video/MP2T",
          })
          .promise()
          .then((response) => {
            if(response)
            {
              console.log("success");
            }
          })
          .catch((error) => console.error(error)).finally;
        {
          fs.rm(path.resolve(filePathTranscoded), { recursive: true }, (err) => {
            if (err) {
              console.error(err, "error");
            }
            console.log(`removed temporary files`);
          });
        }
      });
    }
  }
};
 function uploadMasterPlaylistToS3(filePathOfMasterPlaylist, key,metadata) {
  s3
  .upload({
    Bucket: process.env.AWS_S3_BUCKET_TRANSCODED,
    Key: `${key.split(".")[0].toLowerCase()}/index.m3u8`,
    Body: fs.createReadStream(filePathOfMasterPlaylist),
    ContentType: "application/vnd.apple.mpegurl"
  })
  .promise().then(async(response)=>{
    console.log("master playlist uploaded to s3",response.Location);
    const dbResponse=await videoModel.create({description:metadata.videoDescription,title:metadata.videoTitle,videoUrl:response.Location,S3Key:response.Key})
    console.log(dbResponse,"db response");
    
  }).catch((error)=>{
    console.error(error);
  })
}
async function deleteRawVideoFromS3(key) {
  s3.deleteObject({
    Bucket: process.env.AWS_S3_BUCKET_RAW_VIDEO,
    Key: key,
  })
    .promise()
    .then((response) => {
      console.log(response, "deleted the raw video from s3");
    })
    .catch((error) => {
      console.error(error);
    });
}
