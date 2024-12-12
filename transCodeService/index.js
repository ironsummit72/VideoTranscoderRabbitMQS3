import express, { response } from "express";
import { configDotenv } from "dotenv";
import s3 from "./utils/s3.util.js";
import amqp from "amqplib";
import fs from "node:fs";
import path from "node:path";
import ffmpeg from "fluent-ffmpeg";

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import videoModel from "./models/video.model.js";
import mongoose from "mongoose";

const __dirname = dirname(fileURLToPath(import.meta.url));
configDotenv({
  path: "./.transcodeService.env",
});
mongoose.connection.openUri(`${process.env.MONGO_URL}/${process.env.DB_NAME}`).then(
  (response) => {
    console.log(
      response.host + ":" + response.port,
      "connected to database"
    );
  }
);
  (async () => {
  try {
    console.log('transcoder Service is Running');
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
          const hlsOutputDir = await transcodeToHLS(inputFilePath);
          console.log(hlsOutputDir, "hls Output dir");
          const finalVideoResponse = await uploadToS3(hlsOutputDir, data.key);
          finalVideoResponse.forEach(async (element) => {
            if (element.Location.endsWith(".m3u8")) {
              // save the location to Database and key
              try {
                const dbResponse = await videoModel.create({
                  title: data.videoTitle,
                  description: data.videoDescription,
                  videoUrl: element.Location,
                  S3Key: element.Key,
                });
                console.log(dbResponse, "db response");
              } catch (error) {
                console.error(error);
              }
            }
          });
          console.log("HLS files uploaded successfully to target bucket");
          channel.ack(message);
          // Cleanup temporary files
          deleteRawVideoFromS3(data.key);
          fs.unlinkSync(inputFilePath);
          fs.rm(hlsOutputDir, { recursive: true }, (err) => {
            if (err) {
              console.error(err);
            } else {
              console.log("Temporary files cleaned up");
            }
          });
          console.log("Temporary files cleaned up");
        } catch (error) {
          console.error(error);
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
async function transcodeToHLS(inputFilePath) {
  const outputDir = path.join(__dirname, "uploads", "hls");
  fs.mkdirSync(outputDir, { recursive: true });
  return new Promise((resolve, reject) => {
    ffmpeg(inputFilePath)
      .output(`${outputDir}/output.m3u8`)
      .addOption("-hls_time", "10") // Segment duration in seconds
      .addOption("-hls_playlist_type", "vod") // Create VOD playlist
      .addOption("-hls_segment_filename", `${outputDir}/segment_%03d.ts`) // Segment file naming
      .on("end", () => {
        console.log("HLS transcoding completed");
        resolve(outputDir);
      })
      .on("progress", (progress) => {
        console.log(
          "video processing .....",
          Math.round(progress.percent) + "% done"
        );
      })
      .on("error", reject)
      .run();
  });
}
async function uploadToS3(directory, keyPrefix) {
  const files = fs.readdirSync(directory);
  const uploadPromises = files.map((file) => {
    const filePath = path.join(directory, file);
    const params = {
      Bucket: process.env.AWS_S3_BUCKET_TRANSCODED,
      Key: `${keyPrefix.split(".")[0]}/${file}`,
      Body: fs.createReadStream(filePath),
      ContentType: file.endsWith(".m3u8")
        ? "application/vnd.apple.mpegurl"
        : "video/MP2T",
    };
    return s3.upload(params).promise();
    // .then((response)=>{
    //   if(response.Location.endsWith('.m3u8'))
    //   {
    //     console.log(response.Location);

    //   }
    // });
  });

  return Promise.all(uploadPromises);
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
