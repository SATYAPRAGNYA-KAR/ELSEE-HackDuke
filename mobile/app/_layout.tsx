import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RemoteConfigProvider } from '../context/RemoteConfigContext';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.4 }}>{emoji}</Text>;
}

export default function RootLayout() {
  return (
    <RemoteConfigProvider>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Tabs
          initialRouteName="ask"
          screenOptions={{
            headerShown: false,
            tabBarStyle: styles.tabBar,
            tabBarActiveTintColor: '#00F5C4',
            tabBarInactiveTintColor: '#444',
            tabBarLabelStyle: styles.tabLabel,
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: 'Live',
              tabBarIcon: ({ focused }) => <TabIcon emoji="👁" focused={focused} />,
            }}
          />
          <Tabs.Screen
            name="ask"
            options={{
              title: 'Ask',
              tabBarIcon: ({ focused }) => <TabIcon emoji="🎙" focused={focused} />,
            }}
          />
          <Tabs.Screen
            name="history"
            options={{
              title: 'History',
              tabBarIcon: ({ focused }) => <TabIcon emoji="📋" focused={focused} />,
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              title: 'Settings',
              tabBarIcon: ({ focused }) => <TabIcon emoji="⚙️" focused={focused} />,
            }}
          />
        </Tabs>
      </SafeAreaProvider>
    </GestureHandlerRootView>
    </RemoteConfigProvider>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#0E1320',
    borderTopColor: '#1E2740',
    borderTopWidth: 1,
    paddingBottom: 8,
    paddingTop: 8,
    height: 70,
  },
  tabLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
});
