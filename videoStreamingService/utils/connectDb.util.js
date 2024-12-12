import mongoose from "mongoose";

export default function connectDatabase() {
  mongoose
    .connect(`${process.env.DB_URL}/${process.env.DB_NAME}`)
    .then((response) => {
      console.log(
        "connected to database",
        ` ${response.connection.host}:${response.connection.port}`
      );
    })
    .catch((err) => console.error(err));
}
