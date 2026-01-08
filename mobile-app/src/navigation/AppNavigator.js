// src/navigation/AppNavigator.js
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuth } from '../context/AuthContext';
import { ActivityIndicator, View } from 'react-native';
import { COLORS } from '../utils/constants';

// Auth Screens
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';

// Passenger Screens
import PassengerHomeScreen from '../screens/passenger/HomeScreen';
import RequestRideScreen from '../screens/passenger/RequestRideScreen';
import TrackRideScreen from '../screens/passenger/TrackRideScreen';

// Driver Screens
import DriverHomeScreen from '../screens/driver/DriverHomeScreen';

const Stack = createStackNavigator();

const AuthStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="Register" component={RegisterScreen} />
  </Stack.Navigator>
);

const PassengerStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="PassengerHome" component={PassengerHomeScreen} />
    <Stack.Screen name="RequestRide" component={RequestRideScreen} />
    <Stack.Screen name="TrackRide" component={TrackRideScreen} />
  </Stack.Navigator>
);

const DriverStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="DriverHome" component={DriverHomeScreen} />
  </Stack.Navigator>
);

const AppNavigator = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {user ? (
        user.role === 'driver' ? (
          <DriverStack />
        ) : user.role === 'passenger' ? (
          <PassengerStack />
        ) : (
          // Admin - for now show passenger stack, admin uses web dashboard
          <PassengerStack />
        )
      ) : (
        <AuthStack />
      )}
    </NavigationContainer>
  );
};

export default AppNavigator;