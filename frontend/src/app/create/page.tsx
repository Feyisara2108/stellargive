"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CreateCampaign() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/?create=true");
  }, [router]);

  return null;
}
