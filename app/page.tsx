import Studio from "./studio";
import { serverDiscount } from "../lib/pricing";

export const dynamic = "force-dynamic";

export default function Page() {
  const maxDuration = Math.min(30, Math.max(4, Number(process.env.MAX_DURATION) || 15));
  return <Studio maxDuration={maxDuration} discount={serverDiscount()} />;
}
