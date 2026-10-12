import {
  BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView, BottomSheetView, useBottomSheetSpringConfigs, type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet"
import { useEffect, useRef, type ReactNode } from "react"
import { BackHandler, StyleSheet, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useTheme } from "../theme/useTheme"
import { motion, space } from "../theme/tokens"
import { IconButton } from "./IconButton"
import { Text } from "./Text"

interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  /** e.g. ["50%", "90%"]. Omit to size to content (dynamic sizing). */
  snapPoints?: (string | number)[]
  /** Wrap children in a BottomSheetScrollView (long content). */
  scrollable?: boolean
  /** Sticky content under the scroll area (e.g. a Pay button). */
  footer?: ReactNode
  /** Accessibility label when there's no visible title (e.g. a confirm dialog). */
  accessibilityLabel?: string
}

/** Same dimming everywhere a sheet or dialog opens. */
export function renderSheetBackdrop(props: BottomSheetBackdropProps) {
  return (
    <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={motion.backdropOpacity} pressBehavior="close" />
  )
}

// Controlled wrapper over @gorhom/bottom-sheet's modal: `open` drives
// present()/dismiss(), a tap on the backdrop or swipe-down calls onClose.
// Sheets stack ("push"), so a quantity keypad can open over the cart sheet.
// Keyboard: the sheet rises with it (interactive) and restores on blur.
// Motion: a critically-damped spring from the motion tokens (no bounce), the
// shared backdrop, and Android back closes the top-most open sheet first.
export function Sheet({ open, onClose, title, children, snapPoints, scrollable, footer, accessibilityLabel }: SheetProps) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const ref = useRef<BottomSheetModal>(null)
  const animationConfigs = useBottomSheetSpringConfigs({ ...motion.spring.sheet, overshootClamping: true })

  useEffect(() => {
    if (open) ref.current?.present()
    else ref.current?.dismiss()
  }, [open])

  // Back closes this sheet instead of leaving the screen. Listeners run
  // newest-first, so stacked sheets close top-down.
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })
  useEffect(() => {
    if (!open) return
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      closeRef.current()
      return true
    })
    return () => sub.remove()
  }, [open])


  const header = title ? (
    <View style={styles.header}>
      <Text variant="title" style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <IconButton icon="close" accessibilityLabel="Close" onPress={onClose} />
    </View>
  ) : null

  const bottomPad = { paddingBottom: Math.max(insets.bottom, space.lg) }

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={snapPoints}
      enableDynamicSizing={!snapPoints}
      onDismiss={onClose}
      animationConfigs={animationConfigs}
      backdropComponent={renderSheetBackdrop}
      stackBehavior="push"
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      backgroundStyle={{ backgroundColor: theme.surface }}
      handleIndicatorStyle={{ backgroundColor: theme.borderStrong }}
      accessibilityLabel={title ?? accessibilityLabel}
    >
      {scrollable ? (
        <>
          {header}
          <BottomSheetScrollView contentContainerStyle={[styles.content, footer ? null : bottomPad]} keyboardShouldPersistTaps="handled">
            {children}
          </BottomSheetScrollView>
          {footer ? <View style={[styles.footer, bottomPad, { borderTopColor: theme.border }]}>{footer}</View> : null}
        </>
      ) : (
        <BottomSheetView style={[styles.content, bottomPad]}>
          {header}
          {children}
          {footer}
        </BottomSheetView>
      )}
    </BottomSheetModal>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.xs },
  title: { flex: 1 },
  content: { paddingHorizontal: space.lg, gap: space.md },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth },
})
