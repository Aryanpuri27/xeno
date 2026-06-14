import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { handleApiError } from "@/lib/utils/errors";

export async function GET() {
  try {
    const products = await db.product.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    return NextResponse.json({ data: products });
  } catch (error) {
    return handleApiError(error);
  }
}
