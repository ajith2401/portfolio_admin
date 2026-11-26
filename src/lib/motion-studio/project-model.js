// Admin-only collection `motionprojects` (additive; intentionally NOT in src/models, which is shared byte-for-byte with the Portfolio).
import mongoose from "mongoose";

const MotionProjectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    sourceWritingId: { type: mongoose.Schema.Types.ObjectId, index: true },
    sourceTitle: { type: String, maxlength: 300 },
    sourceKind: { type: String, enum: ["writing", "manual"] }, // "manual": poem typed/pasted/imported in the Studio; its text snapshot lives in composition.poem
    sourceHash: { type: String, maxlength: 64 }, // hash of poem lines when the project was last synced
    sourceVersion: { type: Number }, // Writing.version when last synced (reference only; Writing is never mutated)
    createdBy: { type: String, index: true, maxlength: 64 },
    composition: { type: mongoose.Schema.Types.Mixed, required: true },
    revision: { type: Number, default: 1 },
  },
  { timestamps: true },
);
MotionProjectSchema.index({ updatedAt: -1 });

export default mongoose.models.MotionProject || mongoose.model("MotionProject", MotionProjectSchema);
