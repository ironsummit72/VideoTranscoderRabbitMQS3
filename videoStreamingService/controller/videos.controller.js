import videoModel from "../models/video.model.js";
export async function getAllVideos(_, res) {
  const dbResponse = await videoModel.find({});
  res.status(200).json(dbResponse);
}
