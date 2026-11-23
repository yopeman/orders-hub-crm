import mongoose, { Schema, InferSchemaType, Model } from "mongoose";
import { STAGE_KEYS } from "@/lib/stages";

const ActivitySchema = new Schema(
  {
    date: { type: Date, default: Date.now },
    note: { type: String, default: "" },
    stage: { type: String },
  },
  { _id: true }
);

const LeadSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    business: { type: String, default: "", trim: true },
    phone: { type: String, default: "", trim: true },
    email: { type: String, default: "", trim: true },
    social: { type: String, default: "", trim: true }, // handle or page link
    stage: { type: String, enum: STAGE_KEYS, default: "prospect", index: true },
    hasSocialMedia: { type: Boolean, default: null },
    hasOrderProblem: { type: Boolean, default: null },
    wantsSocialManager: { type: Boolean, default: false },
    lastContactDate: { type: Date, default: null },
    nextAction: { type: String, default: "" },
    followUpDate: { type: Date, default: null, index: true },
    notes: { type: String, default: "" },
    activity: { type: [ActivitySchema], default: [] },
  },
  { timestamps: true }
);

export type LeadDoc = InferSchemaType<typeof LeadSchema>;

export const Lead: Model<LeadDoc> =
  (mongoose.models.Lead as Model<LeadDoc>) ||
  mongoose.model<LeadDoc>("Lead", LeadSchema);
