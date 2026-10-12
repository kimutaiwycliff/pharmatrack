import Ionicons from "@expo/vector-icons/Ionicons"
import { StyleSheet, View } from "react-native"
import { Button, Text } from "../../../components"
import { useTheme } from "../../../theme/useTheme"
import { space } from "../../../theme/tokens"
import { issueKind, issueMeta, type IssueTone, type SyncIssue } from "../logic/kinds"

// One issue, laid out like a row of the web inbox: icon, what happened, the
// specifics, device · receipt · branch · time, what to do (open issues) or the
// resolution note (resolved ones), and a Resolve… button.
export function IssueRow({ issue, showBranch, onResolve }: { issue: SyncIssue; showBranch: boolean; onResolve?: () => void }) {
  const theme = useTheme()
  const k = issueKind(issue.kind)
  const color = toneColor(k.tone, theme)
  const detail = k.describe(issue)
  const meta = issueMeta(issue, { showBranch })
  const open = issue.status === "open"
  return (
    <View style={[styles.row, { borderBottomColor: theme.border }]}>
      <View style={styles.top} accessible accessibilityLabel={[k.label, detail, meta].filter(Boolean).join(". ")}>
        <Ionicons name={k.icon as keyof typeof Ionicons.glyphMap} size={22} color={color} style={styles.icon} />
        <View style={styles.body}>
          <Text variant="bodyStrong">{k.label}</Text>
          {detail ? <Text>{detail}</Text> : null}
          <Text variant="caption" tone="tertiary">
            {meta}
          </Text>
        </View>
      </View>
      {open && k.help ? (
        <Text variant="caption" tone="secondary" style={styles.indent}>
          {k.help}
        </Text>
      ) : null}
      {issue.resolution_note ? (
        <Text variant="caption" style={styles.indent}>
          Note: {issue.resolution_note}
        </Text>
      ) : null}
      {open && onResolve ? (
        <View style={styles.indent}>
          <Button
            title="Resolve…"
            size="sm"
            variant="secondary"
            onPress={onResolve}
            accessibilityLabel={`Resolve: ${k.label}`}
            style={styles.resolve}
          />
        </View>
      ) : null}
    </View>
  )
}

function toneColor(tone: IssueTone, theme: ReturnType<typeof useTheme>): string {
  if (tone === "danger") return theme.red
  if (tone === "warning") return theme.amber
  return theme.textSecondary
}

const ICON = 22

const styles = StyleSheet.create({
  row: { paddingVertical: space.md, gap: space.xs, borderBottomWidth: StyleSheet.hairlineWidth },
  top: { flexDirection: "row", gap: space.md },
  icon: { marginTop: space.xxs },
  body: { flex: 1, gap: space.xxs },
  indent: { marginLeft: ICON + space.md },
  resolve: { alignSelf: "flex-start", marginTop: space.xs },
})
