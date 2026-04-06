import mongoose from "mongoose";

const { Schema } = mongoose;

const userAuthSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
      index: true
    },
    name: { type: String, trim: true, default: "" },
    passwordHash: { type: String, required: true }
  },
  {
    timestamps: true,
    collection: "user_auth"
  }
);

const UserAuth = mongoose.model("UserAuth", userAuthSchema);

export default UserAuth;
