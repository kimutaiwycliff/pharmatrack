import { Redirect } from "expo-router"
import { ActivityIndicator, View } from "react-native"
import { useSession } from "../src/lib/auth-client"

export default function Index() {
  const { data, isPending } = useSession()

  if (isPending) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    )
  }

  return <Redirect href={data?.session ? "/pos" : "/login"} />
}
