import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Lora_600SemiBold,
  Lora_700Bold,
} from '@expo-google-fonts/lora';
import '../lib/amplify';
import { startQueueAutoFlush } from '../lib/offlineQueue';
import { colors, fonts } from '../lib/theme';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    [fonts.display]:     Lora_600SemiBold,
    [fonts.displayBold]: Lora_700Bold,
  });

  useEffect(() => {
    startQueueAutoFlush();
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle:      { backgroundColor: colors.bg },
          headerShadowVisible: false,
          headerTintColor:  colors.primaryDeep,
          headerTitleStyle: { fontFamily: fonts.display, fontSize: 18 },
          headerBackButtonDisplayMode: 'minimal', // chevron only, no "index"/previous-title label
          contentStyle:     { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="report/[type]" options={{ title: 'New report' }} />
        <Stack.Screen name="confirmation/[localId]" options={{ title: 'Report sent', headerBackVisible: false }} />
        <Stack.Screen name="case/[caseId]" options={{ title: 'Track case' }} />
        <Stack.Screen name="shelters" options={{ title: 'Nearby shelters' }} />
        <Stack.Screen name="history" options={{ title: 'Live cases' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
