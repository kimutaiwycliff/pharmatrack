import { Linking, StyleSheet, View } from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import { confirmSignOut } from "../lib/auth-client"
import { useTheme } from "../theme/useTheme"
import { radius, space } from "../theme/tokens"
import { Button } from "./Button"
import { FormScroll } from "./FormScroll"
import { PaymentClaimBox } from "./PaymentClaimBox"
import { Screen } from "./Screen"
import { Text } from "./Text"

// Mirrors apps/web/components/SubscriptionGate.tsx's MESSAGES map and copy
// verbatim, and the same gating rule used at apps/web/app/(dashboard)/layout.tsx
// and apps/web/app/(pos)/layout.tsx: block the whole app unless subStatus is
// "trialing" or "active". Mobile has no server layout to enforce this, so it's
// applied client-side in app/(tabs)/_layout.tsx around every tab. FormScroll
// (not a plain ScrollView) so the M-Pesa code field stays above the keyboard.
const MESSAGES: Record<string, string> = {
  past_due: "Your subscription payment is overdue.",
  suspended: "Your subscription has been suspended.",
  cancelled: "Your subscription has been cancelled.",
  none: "No active subscription was found for this pharmacy.",
}

interface Contact {
  whatsappLink: string
  mailtoLink: string
}

interface SubscriptionGateProps {
  status: string
  isOwner: boolean
  contact: Contact | null
}

export function SubscriptionGate({ status, isOwner, contact }: SubscriptionGateProps) {
  const theme = useTheme()
  const hasContact = !!(contact?.whatsappLink || contact?.mailtoLink)

  return (
    <Screen>
      <FormScroll contentStyle={styles.scrollContent}>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.iconWrap, { backgroundColor: theme.mutedStrong }]}>
            <Ionicons name="shield-outline" size={28} color={theme.amber} />
          </View>
          <Text variant="title" align="center" accessibilityRole="header">
            Access paused
          </Text>
          <Text tone="secondary" align="center" style={styles.message}>
            {MESSAGES[status] ?? MESSAGES.none}
          </Text>
          <Text tone="secondary" align="center" style={styles.instruction}>
            {isOwner
              ? "Pay below, or contact PharmaTrack to restore access for your pharmacy."
              : "Please ask your pharmacy owner to renew the PharmaTrack subscription."}
          </Text>

          {isOwner && <PaymentClaimBox />}

          {hasContact && (
            <View style={styles.contactRow}>
              {contact?.whatsappLink ? (
                <Button
                  title="WhatsApp us"
                  variant="primary"
                  onPress={() => Linking.openURL(contact.whatsappLink)}
                  leadingIcon={<Ionicons name="logo-whatsapp" size={18} color={theme.onAccent} />}
                  style={styles.contactButton}
                />
              ) : null}
              {contact?.mailtoLink ? (
                <Button
                  title="Email us"
                  variant="secondary"
                  onPress={() => Linking.openURL(contact.mailtoLink)}
                  leadingIcon={<Ionicons name="mail-outline" size={18} color={theme.text} />}
                  style={styles.contactButton}
                />
              ) : null}
            </View>
          )}

          <Button
            title="Log out"
            variant="ghost"
            onPress={confirmSignOut}
            leadingIcon={<Ionicons name="log-out-outline" size={18} color={theme.text} />}
            style={styles.signOutButton}
          />
        </View>
      </FormScroll>
    </Screen>
  )
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  card: {
    width: "100%",
    maxWidth: 440,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: space.xl,
    alignItems: "center",
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.md,
  },
  message: { marginTop: space.sm },
  instruction: { marginTop: space.sm },
  contactRow: { flexDirection: "row", gap: space.sm, marginTop: space.lg, width: "100%" },
  contactButton: { flex: 1 },
  signOutButton: { marginTop: space.md, width: "100%" },
})
