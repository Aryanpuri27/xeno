import { db } from "@/lib/db/client";

export interface BrandMemory {
  brandName: string;
  brandTone: "Premium" | "Casual" | "Playful" | "Professional" | "Urgent" | "Motivational";
  preferredChannels: ("whatsapp" | "email" | "sms" | "rcs")[];
  bestPerformingCategories: string[];
  avoidTopics: string[];
  ctaStyle: "discount-first" | "value-first" | "urgency-first";
  targetDemographic: string;
  brandVoice?: string;
  priceRange?: string;
  currentCampaignTheme?: string;
}

const DEFAULT_BRAND_MEMORY: BrandMemory = {
  brandName: "Nike",
  brandTone: "Motivational",
  preferredChannels: ["email", "whatsapp"],
  bestPerformingCategories: ["running", "basketball", "lifestyle"],
  avoidTopics: ["competitor comparisons", "heavy discounting"],
  ctaStyle: "urgency-first",
  targetDemographic: "athletes and fitness enthusiasts aged 18-45",
  brandVoice: "Bold, empowering. Just Do It mentality.",
};

export async function getBrandMemory(): Promise<BrandMemory> {
  const setting = await db.settings.findUnique({ where: { key: "brand_memory" } });
  if (!setting) return DEFAULT_BRAND_MEMORY;
  return setting.value as unknown as BrandMemory;
}

export async function updateBrandMemory(patch: Partial<BrandMemory>): Promise<void> {
  const current = await getBrandMemory();
  await db.settings.upsert({
    where: { key: "brand_memory" },
    update: { value: { ...current, ...patch } },
    create: { key: "brand_memory", value: { ...current, ...patch } },
  });
}
