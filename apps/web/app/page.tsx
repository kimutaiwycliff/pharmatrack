import { Button } from "@/components/ui/button"

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f9fafb]">
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#16a34a] text-white">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
          <span className="text-2xl font-bold tracking-tight text-[#111827]">
            PharmaTrack
          </span>
        </div>
        <p className="text-sm text-[#6b7280]">
          Pharmacy POS &amp; Inventory Management
        </p>
        <Button className="bg-[#16a34a] hover:bg-[#15803d] text-white">
          Get Started
        </Button>
      </div>
    </div>
  )
}
