import mongoose from "mongoose";

const { Schema } = mongoose;

const activitySchema = new Schema(
  {
    text: { type: String, trim: true, required: true },
    time: { type: String, trim: true, required: true }
  },
  { _id: false }
);

const enrolledCourseSchema = new Schema(
  {
    id: { type: Number, required: true },
    progress: { type: Number, default: 0 },
    enrolledAt: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const recommendationHistoryItemSchema = new Schema(
  {
    id: { type: Number, required: true },
    title: { type: String, trim: true, default: "" },
    match: { type: Number, default: 0 }
  },
  { _id: false }
);

const recommendationHistorySchema = new Schema(
  {
    createdAt: { type: String, trim: true, default: "" },
    summary: { type: String, trim: true, default: "" },
    recommendations: { type: [recommendationHistoryItemSchema], default: [] }
  },
  { _id: false }
);

const userProfileSchema = new Schema(
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
    quizAnswers: { type: Schema.Types.Mixed, default: {} },
    savedSkills: { type: [Number], default: [] },
    enrolledCourses: { type: [enrolledCourseSchema], default: [] },
    activityLog: { type: [activitySchema], default: [] },
    recommendationHistory: { type: [recommendationHistorySchema], default: [] }
  },
  {
    timestamps: true,
    collection: "user_profiles"
  }
);

const UserProfile = mongoose.model("UserProfile", userProfileSchema);

export default UserProfile;
