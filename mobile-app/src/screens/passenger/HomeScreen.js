// src/screens/passenger/HomeScreen.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabase';
import { COLORS } from '../../utils/constants';
import { formatDateTime, getStatusColor, getStatusText } from '../../utils/helpers';

const PassengerHomeScreen = ({ navigation }) => {
  const { user, signOut } = useAuth();
  const [activeRide, setActiveRide] = useState(null);
  const [recentRides, setRecentRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchData();
    subscribeToRides();
  }, []);

  const fetchData = async () => {
    try {
      // Get active ride
      const { data: activeRideData } = await supabase
        .from('rides')
        .select(`
          *,
          driver:drivers(
            *,
            user:users(full_name, phone),
            vehicle:vehicles(vehicle_name, vehicle_number)
          ),
          pickup_location:campus_locations!rides_pickup_location_id_fkey(name),
          dropoff_location:campus_locations!rides_dropoff_location_id_fkey(name)
        `)
        .eq('passenger_id', user.id)
        .in('status', ['pending', 'accepted', 'arriving', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      setActiveRide(activeRideData);

      // Get recent completed rides
      const { data: recentData } = await supabase
        .from('rides')
        .select(`
          *,
          pickup_location:campus_locations!rides_pickup_location_id_fkey(name),
          dropoff_location:campus_locations!rides_dropoff_location_id_fkey(name)
        `)
        .eq('passenger_id', user.id)
        .in('status', ['completed', 'cancelled'])
        .order('created_at', { ascending: false })
        .limit(5);

      setRecentRides(recentData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const subscribeToRides = () => {
    const subscription = supabase
      .channel('passenger-rides')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rides',
          filter: `passenger_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Ride update:', payload);
          fetchData();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', onPress: signOut, style: 'destructive' },
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello,</Text>
          <Text style={styles.userName}>{user?.full_name} 👋</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>🚪</Text>
        </TouchableOpacity>
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.requestRideButton}
          onPress={() => navigation.navigate('RequestRide')}
          disabled={activeRide !== null}
        >
          <Text style={styles.requestRideIcon}>🚐</Text>
          <Text style={styles.requestRideText}>
            {activeRide ? 'Ride in Progress' : 'Request Ride'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Active Ride Card */}
      {activeRide && (
        <View style={styles.activeRideCard}>
          <View style={styles.activeRideHeader}>
            <Text style={styles.activeRideTitle}>Active Ride</Text>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(activeRide.status) }]}>
              <Text style={styles.statusText}>{getStatusText(activeRide.status)}</Text>
            </View>
          </View>

          <View style={styles.rideDetails}>
            <View style={styles.locationRow}>
              <Text style={styles.locationIcon}>📍</Text>
              <View style={styles.locationInfo}>
                <Text style={styles.locationLabel}>Pickup</Text>
                <Text style={styles.locationName}>
                  {activeRide.pickup_location?.name || activeRide.pickup_address}
                </Text>
              </View>
            </View>
            
            <View style={styles.locationDivider} />
            
            <View style={styles.locationRow}>
              <Text style={styles.locationIcon}>🎯</Text>
              <View style={styles.locationInfo}>
                <Text style={styles.locationLabel}>Dropoff</Text>
                <Text style={styles.locationName}>
                  {activeRide.dropoff_location?.name || activeRide.dropoff_address}
                </Text>
              </View>
            </View>
          </View>

          {activeRide.driver && (
            <View style={styles.driverInfo}>
              <View style={styles.driverAvatar}>
                <Text style={styles.driverAvatarText}>
                  {activeRide.driver.user?.full_name?.charAt(0) || 'D'}
                </Text>
              </View>
              <View style={styles.driverDetails}>
                <Text style={styles.driverName}>{activeRide.driver.user?.full_name}</Text>
                <Text style={styles.vehicleInfo}>
                  {activeRide.driver.vehicle?.vehicle_name} • {activeRide.driver.vehicle?.vehicle_number}
                </Text>
              </View>
              <TouchableOpacity style={styles.callButton}>
                <Text style={styles.callButtonText}>📞</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={styles.trackButton}
            onPress={() => navigation.navigate('TrackRide', { rideId: activeRide.id })}
          >
            <Text style={styles.trackButtonText}>Track Ride</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Recent Rides */}
      <View style={styles.recentRidesSection}>
        <Text style={styles.sectionTitle}>Recent Rides</Text>
        
        {recentRides.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>🚐</Text>
            <Text style={styles.emptyStateText}>No recent rides</Text>
          </View>
        ) : (
          recentRides.map((ride) => (
            <TouchableOpacity
              key={ride.id}
              style={styles.rideCard}
              onPress={() => navigation.navigate('RideDetails', { rideId: ride.id })}
            >
              <View style={styles.rideCardLeft}>
                <Text style={styles.rideDate}>{formatDateTime(ride.created_at)}</Text>
                <Text style={styles.rideRoute}>
                  {ride.pickup_location?.name} → {ride.dropoff_location?.name}
                </Text>
              </View>
              <View style={[styles.rideStatusBadge, { backgroundColor: getStatusColor(ride.status) + '20' }]}>
                <Text style={[styles.rideStatusText, { color: getStatusColor(ride.status) }]}>
                  {ride.status}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.light,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    backgroundColor: COLORS.primary,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  greeting: {
    color: COLORS.white,
    fontSize: 16,
    opacity: 0.8,
  },
  userName: {
    color: COLORS.white,
    fontSize: 24,
    fontWeight: 'bold',
  },
  logoutButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutText: {
    fontSize: 20,
  },
  quickActions: {
    padding: 20,
    marginTop: -30,
  },
  requestRideButton: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  requestRideIcon: {
    fontSize: 30,
    marginRight: 15,
  },
  requestRideText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  activeRideCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 20,
  },
  activeRideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  activeRideTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.dark,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '600',
  },
  rideDetails: {
    backgroundColor: COLORS.light,
    borderRadius: 15,
    padding: 15,
    marginBottom: 15,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  locationInfo: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 12,
    color: COLORS.gray,
  },
  locationName: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.dark,
  },
  locationDivider: {
    height: 20,
    width: 2,
    backgroundColor: COLORS.lightGray,
    marginLeft: 10,
    marginVertical: 5,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightGray,
  },
  driverAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverAvatarText: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: 'bold',
  },
  driverDetails: {
    flex: 1,
    marginLeft: 12,
  },
  driverName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.dark,
  },
  vehicleInfo: {
    fontSize: 14,
    color: COLORS.gray,
  },
  callButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  callButtonText: {
    fontSize: 20,
  },
  trackButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    marginTop: 15,
  },
  trackButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  recentRidesSection: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.dark,
    marginBottom: 15,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: COLORS.white,
    borderRadius: 15,
  },
  emptyStateIcon: {
    fontSize: 50,
    marginBottom: 10,
  },
  emptyStateText: {
    fontSize: 16,
    color: COLORS.gray,
  },
  rideCard: {
    backgroundColor: COLORS.white,
    borderRadius: 15,
    padding: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  rideCardLeft: {
    flex: 1,
  },
  rideDate: {
    fontSize: 12,
    color: COLORS.gray,
    marginBottom: 4,
  },
  rideRoute: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.dark,
  },
  rideStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  rideStatusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
});

export default PassengerHomeScreen;