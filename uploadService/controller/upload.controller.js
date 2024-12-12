import s3 from "../utils/s3.util.js";
import amqp from "amqplib";
async function initRabbitMq(message) {
  try {
    const connection =await amqp.connect("amqp://localhost");
    const channel = await connection.createChannel();
    const queue = "video_queue";
    await channel.assertQueue(queue, { durable: true });
    if (message) {
      channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)));
      console.log("message sent to queue");
    }
    setTimeout(() => {
      connection.close();
      console.log("connection closed");
    }, 500);
  } catch (error) {
    console.error(error);
  }
}

export async function uploadVideoToS3(req, res) {
  s3.upload({
    Key: `video-${Date.now()}-${req.file.originalname
      .toString()
      .replace(/ /g, "_")}`,
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Body: req.file.buffer,
    ContentType: req.file.mimetype,
  })
    .promise()
    .then((response) => {
      res.status(200).json({
        videoTitle:req.body.title,
        videoDescription:req.body.description,
        message: "video Uploaded successfully",
        location: response?.Location,
        key: response?.Key,
      });
      // put the key the the rabbitMQ queue
      initRabbitMq({ key: response?.Key, message: "process video", videoTitle:req.body.title,
        videoDescription:req.body.description });
    })
    .catch((err) => {
      console.error(err);
    });
}
