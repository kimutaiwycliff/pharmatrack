import Ionicons from "@expo/vector-icons/Ionicons"
import { useState } from "react"
import { StyleSheet, View } from "react-native"
import { useBranchScope } from "../store/branchScope"
import { useTheme } from "../theme/useTheme"
import { space } from "../theme/tokens"
import { Chip } from "./Chip"
import { ListRow } from "./ListRow"
import { Sheet } from "./Sheet"

// R3: "All branches" / a branch picker for staff with branches.all, used in the
// headers of the online back-office screens. Renders nothing for everyone else
// (they only ever see their own branch). The choice is shared across screens
// and remembered (store/branchScope.ts).
export function BranchSwitcher() {
  const theme = useTheme()
  const scope = useBranchScope()
  const [open, setOpen] = useState(false)
  if (!scope.canSwitch) return null

  const options = [{ id: "all", name: "All branches" }, ...scope.branches]
  return (
    <>
      <Chip
        label={scope.label}
        onPress={() => setOpen(true)}
        icon={<Ionicons name="git-branch-outline" size={16} color={theme.text} />}
        accessibilityLabel={`Branch: ${scope.label}. Change branch`}
      />
      <Sheet open={open} onClose={() => setOpen(false)} title="Show data for">
        <View style={styles.list}>
          {options.map((b) => {
            const selected = scope.selected === b.id
            return (
              <ListRow
                key={b.id}
                title={b.name}
                onPress={() => {
                  scope.setScope(b.id)
                  setOpen(false)
                }}
                accessibilityLabel={`${b.name}${selected ? ", selected" : ""}`}
                leading={<Ionicons name={b.id === "all" ? "layers-outline" : "storefront-outline"} size={20} color={theme.textSecondary} />}
                trailing={selected ? <Ionicons name="checkmark-circle" size={22} color={theme.green} /> : null}
              />
            )
          })}
        </View>
      </Sheet>
    </>
  )
}

const styles = StyleSheet.create({
  list: { marginHorizontal: -space.lg },
})
