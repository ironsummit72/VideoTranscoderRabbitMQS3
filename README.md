# VideoTranscoderRabbitMQS3
this is a node js application which has two service one is upload service where user can upload videos. the raw video will be uploaded in a s3 bucket and then the upload service will notify the transcoder service to process the video by giving the s3 key of the video then the TranscoderService will download the video to locally to the server and then start transcoding it to the hls of Http Bitrate streaming and then it will upload the transcoded video To another bucket where transcoded videos are present and then it will save the s3 link to the database in mongodb
here the upload service is the producer and the transcoder service is consumer which consumes the message and process it. 

### How to Setup Locally 


#### Step:1
clone the project in your local machine
```bash
git clone https://github.com/ironsummit72/VideoTranscoderRabbitMQS3.git
```
#### Step:2
check directory
```bash
cd VideoTranscoderRabbitMQS3
```
#### Step:3
install the dependencies
```bash
npm i 
```
#### Step:4
copy the environment variables
```bash
mv .sample.transcodeService.env .transcodeService.env
mv .sample.uploadService.env .uploadService.env
```
#### Step:5
make sure you have rabbit mq in your localmachine or install it from docker and make the necessery changes to the environment files

#### Step:6
this will start both the upload and transcoder service together
```bash
npm run start
```
now you can make a post request on uploadService 
`POST` http://localhost:3000/upload/video  
- `fieldname:video` where you can upload the videos 
- `fieldname:title` where you can give video title 
- `fieldname:description` where you can give video description

# Requirements
- NodeJs
- RabbitMQ (docker)
- MongoDb
  



