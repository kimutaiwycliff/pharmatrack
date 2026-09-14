import { Linking, ScrollView, StyleSheet, Text, View } from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import { Button, Screen } from "./index"
import { confirmSignOut } from "../lib/auth-client"
import { useTheme } from "../theme/useTheme"
import type { Theme } from "../theme/tokens"

// Mirrors apps/web/components/SubscriptionGate.tsx's MESSAGES map and copy
// verbatim, and the same gating rule used at apps/web/app/(dashboard)/layout.tsx
// and apps/web/app/(pos)/layout.tsx: block the whole app unless subStatus is
// "trialing" or "active". Mobile has no server layout to enforce this, so it's
// applied client-side in app/(tabs)/_layout.tsx around every tab.
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
  const styles = createStyles(theme)
  const hasContact = !!(contact?.whatsappLink || contact?.mailtoLink)

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="shield-outline" size={26} color={theme.amber} />
          </View>
          <Text style={styles.title}>Access paused</Text>
          <Text style={styles.message}>{MESSAGES[status] ?? MESSAGES.none}</Text>
          <Text style={styles.instruction}>
            {isOwner
              ? "Please contact PharmaTrack to restore access for your pharmacy."
              : "Please ask your pharmacy owner to renew the PharmaTrack subscription."}
          </Text>

          {hasContact && (
            <View style={styles.contactRow}>
              {contact?.whatsappLink && (
                <Button
                  title="WhatsApp us"
                  variant="primary"
                  onPress={() => Linking.openURL(contact.whatsappLink)}
                  icon={<Ionicons name="logo-whatsapp" size={16} color="#fff" />}
                  style={styles.contactButton}
                />
              )}
              {contact?.mailtoLink && (
                <Button
                  title="Email us"
                  variant="secondary"
                  onPress={() => Linking.openURL(contact.mailtoLink)}
                  icon={<Ionicons name="mail-outline" size={16} color={theme.text} />}
                  style={styles.contactButton}
                />
              )}
            </View>
          )}

          <Button
            title="Sign out"
            variant="secondary"
            onPress={confirmSignOut}
            icon={<Ionicons name="log-out-outline" size={16} color={theme.text} />}
            style={styles.signOutButton}
          />
        </View>
      </ScrollView>
    </Screen>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    scrollContent: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
    card: {
      width: "100%",
      maxWidth: 420,
      backgroundColor: theme.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 24,
      alignItems: "center",
    },
    iconWrap: {
      width: 48,
      height: 48,
      borderRadius: 12,
      backgroundColor: theme.green50,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    title: { fontSize: 18, fontWeight: "700", color: theme.text },
    message: { fontSize: 14, color: theme.textSecondary, marginTop: 10, textAlign: "center" },
    instruction: { fontSize: 14, color: theme.textSecondary, marginTop: 8, textAlign: "center" },
    contactRow: { flexDirection: "row", gap: 8, marginTop: 20, width: "100%" },
    contactButton: { flex: 1 },
    signOutButton: { marginTop: 12, width: "100%" },
  })
}
