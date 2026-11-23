import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Lead } from "@/models/Lead";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const FIELDS = [
  "name",
  "business",
  "phone",
  "email",
  "social",
  "stage",
  "hasSocialMedia",
  "hasOrderProblem",
  "wantsSocialManager",
  "nextAction",
  "notes",
] as const;

const DATE_FIELDS = ["lastContactDate", "followUpDate"] as const;

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    await connectDB();
    const { id } = await params;
    const body = await req.json();

    const set: Record<string, unknown> = {};
    for (const f of FIELDS) if (f in body) set[f] = body[f];
    for (const f of DATE_FIELDS) {
      if (f in body) set[f] = body[f] ? new Date(body[f]) : null;
    }

    const update: Record<string, unknown> = { $set: set };
    // Optional activity log entry, e.g. when the user logs a contact.
    if (body.logNote !== undefined) {
      update.$push = {
        activity: {
          $each: [{ date: new Date(), note: String(body.logNote), stage: body.stage }],
          $position: 0,
        },
      };
    }

    const lead = await Lead.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    }).lean();
    if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(lead);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    await connectDB();
    const { id } = await params;
    await Lead.findByIdAndDelete(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
