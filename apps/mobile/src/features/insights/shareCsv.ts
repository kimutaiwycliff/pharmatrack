import { File, Paths } from "expo-file-system"
import * as Sharing from "expo-sharing"
import { errorMessage } from "../../lib/api"
import { toast } from "../../lib/toast"
import type { CsvFile } from "./logic/csv"

// Android has no browser-style "download", so a report table's CSV is written
// to the cache directory and handed to the OS share sheet (save to Files /
// Drive, email, WhatsApp…). Same approach the pre-R3 reports screen used.
export async function shareCsv({ filename, csv }: CsvFile): Promise<void> {
  try {
    const file = new File(Paths.cache, filename)
    if (file.exists) file.delete()
    file.write(csv)
    await Sharing.shareAsync(file.uri, { mimeType: "text/csv", UTI: "public.comma-separated-values-text", dialogTitle: filename })
  } catch (err) {
    toast.error(`Could not export the CSV. ${errorMessage(err)}`)
  }
}
