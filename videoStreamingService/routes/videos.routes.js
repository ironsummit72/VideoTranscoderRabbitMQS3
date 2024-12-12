import { Router } from "express";
import { getAllVideos } from "../controller/videos.controller.js";
const router=Router()
router.get('/getallvideos',getAllVideos)
export default router;
