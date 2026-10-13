import Ionicons from "@expo/vector-icons/Ionicons"
import { formatKES } from "@pharmatrack/core"
import { memo, useCallback, useMemo, useState } from "react"
import { StyleSheet, View } from "react-native"
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable"
import Animated from "react-native-reanimated"
import { Button, Chip, EmptyState, IconButton, Money, NumericKeypad, PressableScale, QuantityStepper, Sheet, Text } from "../../../components"
import { env } from "../../../lib/env"
import { haptics } from "../../../lib/haptics"
import { keypadNumber } from "../../../lib/keypad"
import { useMotion } from "../../../lib/motion"
import { toast } from "../../../lib/toast"
import { canGiveDiscount, LIMIT_SCOPE, limitMessage, useCartStore, type CartItem, type CartSellUnit } from "../../../store/cart"
import { useTheme } from "../../../theme/useTheme"
import { radius, space } from "../../../theme/tokens"
import { setLineQty, setLineUnit } from "../actions"
import { listSellUnits } from "../data"
import { baseQtyInCart, lineCap, lineKey, lineTotals, remainingFor, sellPriceCents, sellQty, sellUnitLabel } from "../logic/cart"
import { sellByAmount } from "../logic/sellByAmount"
import { ClinicalBadges } from "./ProductParts"

const OFFLINE_EDITION = env.EXPO_PUBLIC_OFFLINE_MODE
const LOW_LEFT = 5

type EditMode = "unit" | "amount" | "discount"

/**
 * Remove a line, with an Undo on the toast that puts it back where it was
 * (re-checking the stock/allowance cap — Undo can never oversell).
 */
export function removeLineWithUndo(line: CartItem) {
  const cart = useCartStore.getState()
  const key = lineKey(line)
  const index = cart.items.findIndex((i) => lineKey(i) === key)
  if (index < 0) return
  const snapshot = cart.items[index]!
  haptics.warning()
  cart.remove(key)
  const title = `${line.productName}${line.productStrength ? ` ${line.productStrength}` : ""}`
  toast.info(`Removed ${title}`, {
    action: {
      label: "Undo",
      onPress: () => {
        const r = useCartStore.getState().restore(snapshot, index)
        if (r.ok) {
          haptics.add()
          return
        }
        if (r.reason === "limit") {
          haptics.error()
          const items = useCartStore.getState().items
          const limit = items.find((i) => i.productId === snapshot.productId)?.stockOnHand ?? snapshot.stockOnHand
          toast.error(limitMessage(LIMIT_SCOPE, snapshot.productName, Math.max(0, limit - baseQtyInCart(items, snapshot.productId))))
        }
      },
    },
  })
}

/** Every cart line, plus the one editor sheet (unit / sell-by-amount / discount) they share. */
export function CartLines() {
  const theme = useTheme()
  const m = useMotion()
  const items = useCartStore((s) => s.items)
  const [editor, setEditor] = useState<{ key: string; mode: EditMode } | null>(null)
  const openEditor = useCallback((key: string, mode: EditMode) => setEditor({ key, mode }), [])
  const discountAllowed = canGiveDiscount()

  if (items.length === 0) {
    return <EmptyState icon={<Ionicons name="cart-outline" size={32} color={theme.textTertiary} />} message="Cart is empty — search or scan to add" />
  }
  // Cart lines are a plain list (not FlashList), so they get layout motion:
  // a removed line fades out and the rest slide up to close the gap.

  const editing = editor ? items.find((i) => lineKey(i) === editor.key) ?? null : null
  // Lines are memoised and get plain numbers (left / cap), so a change to one
  // line re-renders only the lines of that product, not the whole cart.
  return (
    <View style={styles.list}>
      {items.map((line) => (
        <Animated.View key={lineKey(line)} entering={m.fadeIn} exiting={m.fadeOut} layout={m.layout}>
          <CartLine
            line={line}
            left={remainingFor(items, line.productId, line.stockOnHand)}
            cap={lineCap(items, line)}
            discountAllowed={discountAllowed}
            onEdit={openEditor}
          />
        </Animated.View>
      ))}
      <LineEditor line={editing} mode={editor?.mode ?? null} onClose={() => setEditor(null)} />
    </View>
  )
}

interface CartLineProps {
  line: CartItem
  /** Base units of the product still free once the whole cart is counted. */
  left: number
  /** Most sell units this line may hold (lineCap). */
  cap: number
  discountAllowed: boolean
  /** Stable (useCallback) so memo holds. */
  onEdit: (key: string, mode: EditMode) => void
}

const CartLine = memo(function CartLine({ line, left, cap, discountAllowed, onEdit }: CartLineProps) {
  const theme = useTheme()
  const key = lineKey(line)
  const qty = sellQty(line)
  const unit = sellUnitLabel(line)
  const totals = lineTotals(line)
  const packs = useMemo(() => listSellUnits(line.productId), [line.productId])
  const title = `${line.productName}${line.productStrength ? ` ${line.productStrength}` : ""}`

  const removeLine = () => removeLineWithUndo(line)

  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={64}
      overshootRight={false}
      onSwipeableOpen={removeLine}
      renderRightActions={() => (
        <View style={[styles.swipeAction, { backgroundColor: theme.red }]}>
          <Ionicons name="trash-outline" size={22} color={theme.onAccent} />
          <Text variant="label" style={{ color: theme.onAccent }}>
            Remove
          </Text>
        </View>
      )}
    >
      <View
        style={[styles.line, { backgroundColor: theme.surface, borderColor: theme.border }]}
        accessibilityHint="Swipe left to remove"
      >
        <View style={styles.headRow}>
          <View style={styles.flex}>
            <Text variant="bodyStrong" numberOfLines={2}>
              {title}
            </Text>
            <Text variant="caption" tone="secondary">
              {formatKES(sellPriceCents(line))} per {unit}
            </Text>
          </View>
          <View style={styles.amountCol}>
            <Money cents={totals.net} variant="headline" />
            {totals.discount > 0 ? (
              <Text variant="caption" tone="success">
                −{formatKES(totals.discount)} ({line.discountPercent}%)
              </Text>
            ) : null}
          </View>
          <IconButton icon="trash-outline" variant="plain" color={theme.red} accessibilityLabel={`Remove ${title}`} onPress={removeLine} />
        </View>

        <View style={styles.controlsRow}>
          <QuantityStepper
            value={qty}
            min={1}
            max={cap}
            unitLabel={unit}
            onChange={(n) => void setLineQty(key, n)}
            onLimit={() => void setLineQty(key, qty + 1)}
          />
          {packs.length > 0 ? (
            <Chip
              label={`${unit} ▾`}
              accessibilityLabel={`Selling by ${unit}. Change unit`}
              onPress={() => onEdit(key, "unit")}
              style={styles.unitChip}
            />
          ) : null}
        </View>

        <View style={styles.optionsRow}>
          <Chip
            label="Sell KES ___"
            icon={<Ionicons name="cash-outline" size={16} color={theme.text} />}
            accessibilityLabel={`Sell ${line.productName} by amount`}
            onPress={() => onEdit(key, "amount")}
          />
          {discountAllowed ? (
            <Chip
              label={line.discountPercent > 0 ? `Discount ${line.discountPercent}%` : "Discount"}
              selected={line.discountPercent > 0}
              icon={<Ionicons name="pricetag-outline" size={16} color={line.discountPercent > 0 ? theme.green600 : theme.text} />}
              accessibilityLabel={`Discount for ${line.productName}`}
              onPress={() => onEdit(key, "discount")}
            />
          ) : null}
          <ClinicalBadges requiresPrescription={line.requiresPrescription} isControlled={line.isControlled} />
        </View>

        {left <= LOW_LEFT ? (
          <Text variant="caption" tone={left === 0 ? "danger" : "warning"} accessibilityLiveRegion="polite">
            {left === 0
              ? OFFLINE_EDITION ? "No more in stock" : "No more left on this device"
              : OFFLINE_EDITION ? `Only ${left} more ${line.baseUnit}${left === 1 ? "" : "s"} in stock` : `Only ${left} more ${line.baseUnit}${left === 1 ? "" : "s"} left on this device`}
          </Text>
        ) : null}
      </View>
    </ReanimatedSwipeable>
  )
})

interface EditorProps {
  line: CartItem | null
  mode: EditMode | null
  onClose: () => void
}

/** One sheet for the three per-line editors; keyed by line so drafts reset per line. */
function LineEditor({ line, mode, onClose }: EditorProps) {
  const open = !!line && !!mode
  const title = mode === "unit" ? "Sell by" : mode === "amount" ? "Sell by amount" : mode === "discount" ? "Line discount" : undefined
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {line && mode === "unit" ? <UnitPicker line={line} onDone={onClose} /> : null}
      {line && mode === "amount" ? <AmountEditor key={lineKey(line)} line={line} onDone={onClose} /> : null}
      {line && mode === "discount" ? <DiscountEditor key={lineKey(line)} line={line} onDone={onClose} /> : null}
    </Sheet>
  )
}

function UnitPicker({ line, onDone }: { line: CartItem; onDone: () => void }) {
  const theme = useTheme()
  // A synchronous SQLite read — once per line, not on every render.
  const packs = useMemo(() => listSellUnits(line.productId), [line.productId])
  const options: { unit: CartSellUnit | null; label: string; detail: string; price: number }[] = [
    { unit: null, label: line.baseUnit, detail: `1 ${line.baseUnit}`, price: line.unitPrice },
    ...packs.map((p) => ({ unit: p, label: p.label, detail: `${p.unitCount} ${line.baseUnit}s`, price: p.priceCents })),
  ]
  const current = line.sellUnit?.packSizeId ?? null
  return (
    <View style={styles.options}>
      {options.map((o) => {
        const selected = (o.unit?.packSizeId ?? null) === current
        return (
          <PressableScale
            key={o.unit?.packSizeId ?? "base"}
            onPress={async () => {
              if (!selected) await setLineUnit(lineKey(line), o.unit)
              onDone()
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${o.label}, ${formatKES(o.price)}`}
            style={({ pressed }) => [
              styles.option,
              { borderColor: selected ? theme.green : theme.border, backgroundColor: selected ? theme.green50 : pressed ? theme.mutedStrong : theme.surface },
            ]}
          >
            <View style={styles.flex}>
              <Text variant="bodyStrong">{o.label}</Text>
              <Text variant="caption" tone="secondary">
                {o.detail}
              </Text>
            </View>
            <Money cents={o.price} />
          </PressableScale>
        )
      })}
    </View>
  )
}

function AmountEditor({ line, onDone }: { line: CartItem; onDone: () => void }) {
  const [digits, setDigits] = useState("")
  const unitPrice = sellPriceCents(line)
  const unit = sellUnitLabel(line)
  const result = sellByAmount(keypadNumber(digits) * 100, unitPrice)
  const pick = async (units: number) => {
    if (await setLineQty(lineKey(line), units)) onDone()
  }
  return (
    <>
      <Text variant="caption" tone="secondary" align="center">
        {line.productName} · {formatKES(unitPrice)} per {unit}
      </Text>
      <Text variant="display" align="center" tabular accessibilityLiveRegion="polite">
        KES {digits === "" ? "0" : Number(digits).toLocaleString("en-KE")}
      </Text>
      {result.kind === "tooSmall" ? (
        <Text variant="body" tone="warning" align="center">
          That is less than one {unit} ({formatKES(result.unitPriceCents)}). Enter at least {formatKES(result.unitPriceCents)}.
        </Text>
      ) : null}
      {result.kind === "exact" || result.kind === "between" ? (
        <>
          {result.kind === "between" ? (
            <Text variant="caption" tone="secondary" align="center">
              Doesn&apos;t divide evenly — pick the nearest whole quantity
            </Text>
          ) : null}
          <View style={styles.amountOptions}>
            {result.options.map((o) => (
              <Button
                key={o.units}
                title={`${o.units} ${unit}${o.units === 1 ? "" : "s"} · ${formatKES(o.cents)}`}
                variant={result.kind === "exact" ? "primary" : "secondary"}
                onPress={() => pick(o.units)}
                style={styles.flex}
              />
            ))}
          </View>
        </>
      ) : null}
      <NumericKeypad value={digits} onChange={setDigits} maxLength={6} />
    </>
  )
}

function DiscountEditor({ line, onDone }: { line: CartItem; onDone: () => void }) {
  const setLineDiscount = useCartStore((s) => s.setLineDiscount)
  const [digits, setDigits] = useState(line.discountPercent > 0 ? String(line.discountPercent) : "")
  const cap = line.maxDiscountPercent
  const apply = (pct: number) => {
    const r = setLineDiscount(lineKey(line), pct)
    if (!r.ok) {
      haptics.error()
      toast.error(r.reason === "permission" ? "You don't have permission to give discounts" : "That line is no longer in the cart")
      onDone()
      return
    }
    if (r.capped) toast.info(`${line.productName}: discount capped at ${r.applied}%`)
    haptics.tick()
    onDone()
  }
  return (
    <>
      <Text variant="display" align="center" tabular accessibilityLiveRegion="polite">
        {digits === "" ? "0" : digits}%
      </Text>
      <Text variant="caption" tone="secondary" align="center">
        {cap !== null ? `Maximum for ${line.productName}: ${cap}%` : `No product limit for ${line.productName}`}
      </Text>
      <NumericKeypad value={digits} onChange={setDigits} maxLength={3} hideDoubleZero />
      <View style={styles.amountOptions}>
        {line.discountPercent > 0 ? <Button title="Remove" variant="secondary" onPress={() => apply(0)} style={styles.flex} /> : null}
        <Button title="Apply discount" onPress={() => apply(keypadNumber(digits))} style={styles.flex} />
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  flex: { flex: 1 },
  line: { borderWidth: 1, borderRadius: radius.lg, padding: space.md, gap: space.sm },
  headRow: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  amountCol: { alignItems: "flex-end", paddingTop: space.xxs },
  controlsRow: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  unitChip: { flexShrink: 1 },
  optionsRow: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  swipeAction: {
    justifyContent: "center",
    alignItems: "center",
    width: 96,
    borderRadius: radius.lg,
    marginLeft: space.sm,
    gap: space.xxs,
  },
  options: { gap: space.sm },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 56,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
  },
  amountOptions: { flexDirection: "row", gap: space.sm },
})
