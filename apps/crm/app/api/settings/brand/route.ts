import { NextRequest, NextResponse } from "next/server";
import { getBrandMemory, updateBrandMemory } from "@/lib/memory/brand";
import { handleApiError } from "@/lib/utils/errors";

export async function GET() {
  try {
    const brand = await getBrandMemory();
    return NextResponse.json({ data: brand });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    await updateBrandMemory(body);
    const updated = await getBrandMemory();
    return NextResponse.json({ data: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
