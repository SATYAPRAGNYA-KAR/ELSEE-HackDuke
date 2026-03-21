/**
 * App Navigation — Bottom Tab Navigator
 */

import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text, View } from "react-native";

import LiveFeedScreen from "../screens/LiveFeedScreen";
import QueryScreen from "../screens/QueryScreen";
import HistoryScreen from "../screens/HistoryScreen";
import SettingsScreen from "../screens/SettingsScreen";

const Tab = createBottomTabNavigator();

const TabIcon = ({ name, focused }: { name: string; focused: boolean }) => (
  <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.4 }}>{name}</Text>
);

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: "#0A0A0F",
            borderTopColor: "#1A1A2E",
            borderTopWidth: 1,
            paddingBottom: 8,
            paddingTop: 8,
            height: 72,
          },
          tabBarActiveTintColor: "#00F5C4",
          tabBarInactiveTintColor: "#444",
          tabBarLabelStyle: { fontSize: 11, fontWeight: "600", marginTop: 2 },
        }}
      >
        <Tab.Screen
          name="Live"
          component={LiveFeedScreen}
          options={{ tabBarIcon: ({ focused }) => <TabIcon name="👁" focused={focused} /> }}
        />
        <Tab.Screen
          name="Ask"
          component={QueryScreen}
          options={{ tabBarIcon: ({ focused }) => <TabIcon name="🎙" focused={focused} /> }}
        />
        <Tab.Screen
          name="History"
          component={HistoryScreen}
          options={{ tabBarIcon: ({ focused }) => <TabIcon name="📋" focused={focused} /> }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ tabBarIcon: ({ focused }) => <TabIcon name="⚙️" focused={focused} /> }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
