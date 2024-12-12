import AWS from 'aws-sdk';
const s3=new AWS.S3({
    endpoint: 'http://localhost:4566', // LocalStack endpoint
    s3ForcePathStyle: true,            // Required for LocalStack
    accessKeyId: 'test',               // Dummy credentials
    secretAccessKey: 'test',
    region:'us-east-1'
});
export default s3