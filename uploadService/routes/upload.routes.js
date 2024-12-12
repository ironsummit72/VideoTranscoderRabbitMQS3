import { Router } from "express";
import { uploadVideoToS3 } from "../controller/upload.controller.js";
import multer from "multer";
const storage=multer.memoryStorage();
const upload=multer({storage});
const router=Router();
router.post('/video',upload.single('video'),uploadVideoToS3);
export default router;


