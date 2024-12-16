import { configDotenv } from "dotenv";
import express from 'express'
import connectDatabase from "./utils/connectDb.util.js";
import videoRouter from "./routes/videos.routes.js";
import cors from 'cors'
configDotenv({
  path: "./.streamingService.env",
});


connectDatabase();
const app=express();
const port=process.env.PORT;

app.use(cors())
app.use('/video',videoRouter)







app.listen(port,()=>{
console.log(`Streaming service is running on port ${port}`);
})


