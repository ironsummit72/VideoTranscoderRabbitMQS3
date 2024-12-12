import express from 'express';
import { configDotenv } from 'dotenv';
import uploadRouter from './routes/upload.routes.js'
configDotenv({
    path: './.uploadService.env',
});

const app=express();
const port= process.env.PORT




app.use(express.json());
app.use(express.urlencoded({extended:true}));

app.use('/upload',uploadRouter);

app.listen(port,()=>{
    console.log(`upload service is listening on port ${port}`);
})