import mongoose, { Schema } from "mongoose";
const videoSchema = new Schema({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: false,
  },
  videoUrl: {
    type: String,
    required: true,
  },
  S3Key:{
    type:String,
    required:true
  }
});
const videoModel=mongoose.model('Video',videoSchema);
export default videoModel;

