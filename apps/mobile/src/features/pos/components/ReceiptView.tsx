import Ionicons from "@expo/vector-icons/Ionicons"
import { formatKES } from "@pharmatrack/core"
import * as Print from "expo-print"
import * as Sharing from "expo-sharing"
import { useEffect, useState, type ReactNode } from "react"
import { KeyboardAvoidingView, Linking, ScrollView, Share, StyleSheet, View, useWindowDimensions } from "react-native"
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated"
import { AnimatedNumber, Button, CheckMark, Text, TextField } from "../../../components"
import { haptics } from "../../../lib/haptics"
import { useMotion } from "../../../lib/motion"
import { toast } from "../../../lib/toast"
import { useTheme } from "../../../theme/useTheme"
import { motion, radius, space, TABLET_MIN_WIDTH } from "../../../theme/tokens"
import { nairobiDateTime, receiptHeightPt, receiptHtml, receiptText, RECEIPT_WIDTH_PT, whatsappUrl, type ReceiptData } from "../logic/receipt"

interface ReceiptViewProps {
  receipt: ReceiptData
  /** Online build, saved on the phone but not uploaded yet. */
  queued: boolean
  /** Offline Edition has no server, so no sync line at all. */
  showSyncState: boolean
  /** Omitted (Sales history reprint) → no "New sale" button. */
  onNewSale?: () => void
  /** R3 Sales history: "reprint" swaps the "Sale complete" hero and the
   *  give-change box for the receipt number, date and `status`. */
  mode?: "complete" | "reprint"
  /** Reprint only: badges / notes under the receipt number (e.g. "Waiting to sync"). */
  status?: ReactNode
  /** Prefills the WhatsApp number (the sale's customer phone, if any). */
  initialPhone?: string | null
}

// Sale-complete hero timeline (ms after mount; the POS mounts this only once
// the sale is committed to SQLite, while the payment sheet slides away).
// Everything is decorative and non-blocking — "New sale" works immediately —
// and the whole sequence settles within ~800 ms. Reduced motion: no movement,
// haptic straight away.
const HERO = {
  circle: 80,
  check: 200,
  /** Check finishes drawing (110 + 170) — the success haptic lands here. */
  checkPeak: 200 + 280,
  title: 280,
  change: 340,
  changeCount: 400,
  lines: 380,
  maxLineStagger: 6,
} as const

// Shown right after a sale commits. "New sale" is the big, obvious action;
// sharing is optional (WhatsApp text or an 80 mm PDF — no Bluetooth printing).
// Sales history reuses it in "reprint" mode so a reprint is identical.
export function ReceiptView({ receipt, queued, showSyncState, onNewSale, mode = "complete", status, initialPhone }: ReceiptViewProps) {
  const theme = useTheme()
  const { width } = useWindowDimensions()
  const [phone, setPhone] = useState(initialPhone ?? "")
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [sharingPdf, setSharingPdf] = useState(false)
  const m = useMotion()
  const hero = mode === "complete"

  // Success haptic at the moment the check mark completes.
  useEffect(() => {
    if (!hero) return
    const t = setTimeout(() => haptics.success(), m.reduced ? 0 : HERO.checkPeak)
    return () => clearTimeout(t)
    // Once per receipt shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function shareWhatsApp() {
    const text = receiptText(receipt)
    const url = whatsappUrl(text, phone)
    if (!url) {
      setPhoneError("Enter a Kenyan mobile number, e.g. 0712 345 678 — or leave it blank")
      return
    }
    setPhoneError(null)
    try {
      await Linking.openURL(url)
    } catch {
      // WhatsApp not installed (whatsapp:// can't open) — any app will do.
      await Share.share({ message: text }).catch(() => {})
    }
  }

  async function sharePdf() {
    setSharingPdf(true)
    try {
      const { uri } = await Print.printToFileAsync({
        html: receiptHtml(receipt),
        width: RECEIPT_WIDTH_PT,
        height: receiptHeightPt(receipt),
      })
      await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: `Receipt ${receipt.receiptNumber}` })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the receipt PDF")
    } finally {
      setSharingPdf(false)
    }
  }

  return (
    // R3: the WhatsApp number field sits at the bottom — keep it above the keyboard.
    <KeyboardAvoidingView style={styles.fill} behavior="padding">
    <ScrollView contentContainerStyle={[styles.scroll, width >= TABLET_MIN_WIDTH && styles.wide]} keyboardShouldPersistTaps="handled">
      {mode === "reprint" ? (
        <View style={styles.reprintHero}>
          <Text variant="title" accessibilityRole="header" tabular>
            Receipt {receipt.receiptNumber}
          </Text>
          <Text variant="caption" tone="secondary">
            {nairobiDateTime(receipt.soldAtMs)} · {receipt.shopName}
          </Text>
          {status}
        </View>
      ) : (
      <View style={styles.hero} accessibilityLiveRegion="polite" accessibilityLabel={`Sale complete. Receipt ${receipt.receiptNumber}`}>
        <SuccessBadge />
        <Animated.View entering={m.stagger(0, HERO.title)} style={styles.heroText}>
          <Text variant="title" align="center" accessibilityRole="header">
            Sale complete
          </Text>
          <Text variant="bodyStrong" align="center" tabular>
            Receipt {receipt.receiptNumber}
          </Text>
          {showSyncState ? (
            <Text variant="caption" tone={queued ? "warning" : "secondary"} align="center">
              {queued ? "Queued — will sync when back online" : "Saved on this phone — uploading…"}
            </Text>
          ) : null}
        </Animated.View>
      </View>
      )}

      {mode === "complete" && receipt.changeCents > 0 ? (
        <Animated.View entering={m.stagger(0, HERO.change)} style={[styles.changeBox, { backgroundColor: theme.green50, borderColor: theme.green }]}>
          <Text variant="label" tone="success">
            Give change
          </Text>
          <AnimatedNumber
            value={receipt.changeCents}
            format={formatKES}
            variant="display"
            tone="success"
            fromZero
            delay={HERO.changeCount}
            accessibilityLabel={`Give change ${formatKES(receipt.changeCents)}`}
          />
        </Animated.View>
      ) : null}

      {onNewSale ? (
        <Button
          title="New sale"
          size="lg"
          onPress={onNewSale}
          leadingIcon={<Ionicons name="add-circle-outline" size={24} color={theme.onAccent} />}
        />
      ) : null}

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {receipt.lines.map((l, i) => (
          <Animated.View
            key={i}
            entering={hero ? m.stagger(Math.min(i, HERO.maxLineStagger), HERO.lines) : undefined}
            style={styles.lineRow}
          >
            <View style={styles.flex}>
              <Text variant="body">{l.name}</Text>
              <Text variant="caption" tone="secondary">
                {l.qtyLabel}
                {l.discountCents > 0 ? ` · −${formatKES(l.discountCents)}` : ""}
              </Text>
            </View>
            <Text variant="bodyStrong" tabular>
              {formatKES(l.totalCents)}
            </Text>
          </Animated.View>
        ))}
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        {receipt.discountCents > 0 ? <Row label="Discount" value={`−${formatKES(receipt.discountCents)}`} /> : null}
        <Row label="Total" value={formatKES(receipt.totalCents)} strong />
        <Row label={`Paid (${receipt.paymentLabel})`} value={formatKES(receipt.paidCents)} />
        {receipt.changeCents > 0 ? <Row label="Change" value={formatKES(receipt.changeCents)} /> : null}
        {receipt.mpesaReference ? <Row label="M-Pesa ref" value={receipt.mpesaReference} /> : null}
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <Text variant="caption" tone="secondary">
          {nairobiDateTime(receipt.soldAtMs)} · Served by {receipt.cashier}
        </Text>
      </View>

      <View style={styles.share}>
        <TextField
          label="Customer WhatsApp (optional)"
          placeholder="07XX XXX XXX"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
          error={phoneError}
        />
        <View style={styles.shareButtons}>
          <Button
            title="WhatsApp"
            variant="secondary"
            onPress={() => void shareWhatsApp()}
            accessibilityLabel="Share receipt via WhatsApp"
            leadingIcon={<Ionicons name="logo-whatsapp" size={20} color={theme.green600} />}
            style={styles.flex}
          />
          <Button
            title="Share PDF"
            variant="secondary"
            onPress={() => void sharePdf()}
            loading={sharingPdf}
            accessibilityLabel="Share receipt as PDF"
            leadingIcon={<Ionicons name="document-text-outline" size={20} color={theme.text} />}
            style={styles.flex}
          />
        </View>
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
  )
}

/** Green circle springs 0.8 → 1 (no overshoot), then the check draws itself in. */
function SuccessBadge() {
  const theme = useTheme()
  const { reduced } = useMotion()
  const scale = useSharedValue(reduced ? 1 : 0.8)
  const opacity = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) return
    const never = ReduceMotion.Never
    scale.value = withDelay(HERO.circle, withSpring(1, { ...motion.spring.gentle, reduceMotion: never }))
    opacity.value = withDelay(HERO.circle, withTiming(1, { duration: motion.duration.fast, reduceMotion: never }))
  }, [reduced, scale, opacity])
  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }))
  return (
    <Animated.View style={[styles.tick, { backgroundColor: theme.green50 }, style]}>
      <CheckMark size={56} color={theme.green600} delay={HERO.check} />
    </Animated.View>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.lineRow}>
      <Text variant={strong ? "headline" : "body"} tone={strong ? "default" : "secondary"}>
        {label}
      </Text>
      <Text variant={strong ? "headline" : "body"} tabular>
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { gap: space.lg, paddingBottom: space.xxl },
  wide: { width: "100%", maxWidth: 560, alignSelf: "center" },
  flex: { flex: 1 },
  hero: { alignItems: "center", gap: space.xs, paddingTop: space.md },
  heroText: { alignItems: "center", gap: space.xs },
  reprintHero: { gap: space.xs },
  tick: { width: 96, height: 96, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", marginBottom: space.sm },
  changeBox: { alignItems: "center", borderWidth: 2, borderRadius: radius.lg, paddingVertical: space.md },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  lineRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: space.md },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: space.xs },
  share: { gap: space.md },
  shareButtons: { flexDirection: "row", gap: space.sm },
})
