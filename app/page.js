import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getUserContentCounts } from "@/lib/db/queries";

export default async function Home() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const { documentCount, questionCount } = await getUserContentCounts(userId);

  if (documentCount === 0 && questionCount === 0) {
    redirect("/browse");
  }

  redirect("/study");
}
