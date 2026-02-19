/**
 * OWUI Native - Native iOS Client
 * React Native app with auth, chats, streaming, and file upload
 *
 * @format
 */

import React from 'react';
import {
  StatusBar,
  View,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { LoginScreen } from './src/screens/LoginScreen';
import { ChatsScreen } from './src/screens/ChatsScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import type { RootStackParamList } from './src/navigation/types';

const Stack = createNativeStackNavigator<RootStackParamList>();

function AuthNavigator() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#58a6ff" />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0d1117' },
      }}
    >
      {!isAuthenticated ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : (
        <>
          <Stack.Screen name="Chats" component={ChatsScreen} />
          <Stack.Screen name="Chat" component={ChatScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}

function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar barStyle="light-content" backgroundColor="#0d1117" />
        <NavigationContainer>
          <AuthNavigator />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0d1117',
  },
});

export default App;
