import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Lead } from "@/models/Lead";
import { stageByKey } from "@/lib/stages";

export const dynamic = "force-dynamic";

const toDate = (v: unknown) => (v ? new Date(String(v)) : null);

export async function GET() {
  try {
    await connectDB();
    const leads = await Lead.find().sort({ followUpDate: 1, createdAt: -1 }).lean();
    return NextResponse.json(leads);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await connectDB();
    const body = await req.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    const stage = body.stage || "prospect";
    const lead = await Lead.create({
      name: body.name,
      business: body.business,
      phone: body.phone,
      email: body.email,
      social: body.social,
      stage,
      hasSocialMedia: body.hasSocialMedia ?? null,
      hasOrderProblem: body.hasOrderProblem ?? null,
      wantsSocialManager: !!body.wantsSocialManager,
      lastContactDate: toDate(body.lastContactDate),
      nextAction: body.nextAction || stageByKey(stage).next,
      followUpDate: toDate(body.followUpDate),
      notes: body.notes,
      activity: [{ date: new Date(), note: "Lead added", stage }],
    });
    return NextResponse.json(lead, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
