// src/screens/driver/DriverHomeScreen.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  Linking,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabase';
import { COLORS } from '../../utils/constants';
import { calculateDistance, formatDistance, getStatusColor } from '../../utils/helpers';

const DriverHomeScreen = ({ navigation }) => {
  const { user, userDetails, signOut } = useAuth();
  const [driverData, setDriverData] = useState(null);
  const [activeRide, setActiveRide] = useState(null);
  const [pendingRides, setPendingRides] = useState([]);
  const [isAvailable, setIsAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({ today: 0, total: 0, rating: 5.0 });

  const fetchDriverData = useCallback(async () => {
    try {
      // Get driver record
      const { data: driver, error } = await supabase
        .from('drivers')
        .select('*, vehicle:vehicles(*)')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;

      setDriverData(driver);
      setIsAvailable(driver.status === 'available');

      // Get active ride for this driver
      const { data: activeRideData } = await supabase
        .from('rides')
        .select(`
          *,
          passenger:users!rides_passenger_id_fkey(full_name, phone),
          pickup_location:campus_locations!rides_pickup_location_id_fkey(name, latitude, longitude),
          dropoff_location:campus_locations!rides_dropoff_location_id_fkey(name)
        `)
        .eq('driver_id', driver.id)
        .in('status', ['accepted', 'arriving', 'in_progress'])
        .maybeSingle();

      setActiveRide(activeRideData);

      // Get pending rides if driver is available and has no active ride
      if (driver.status === 'available' && !activeRideData) {
        const { data: pending } = await supabase
          .from('rides')
          .select(`
            *,
            passenger:users!rides_passenger_id_fkey(full_name),
            pickup_location:campus_locations!rides_pickup_location_id_fkey(name, latitude, longitude),
            dropoff_location:campus_locations!rides_dropoff_location_id_fkey(name)
          `)
          .eq('status', 'pending')
          .is('driver_id', null)
          .order('created_at', { ascending: true })
          .limit(10);

        // Calculate distance for each pending ride
        const pendingWithDistance = (pending || []).map((ride) => ({
          ...ride,
          distance: calculateDistance(
            driver.vehicle?.current_latitude || 7.854,
            driver.vehicle?.current_longitude || 9.7835,
            ride.pickup_latitude,
            ride.pickup_longitude
          ),
        }));

        // Sort by distance
        pendingWithDistance.sort((a, b) => a.distance - b.distance);
        setPendingRides(pendingWithDistance);
      } else {
        setPendingRides([]);
      }

      // Get stats
      const today = new Date().toISOString().split('T')[0];
      const { data: todayRides } = await supabase
        .from('rides')
        .select('id')
        .eq('driver_id', driver.id)
        .eq('status', 'completed')
        .gte('completed_at', today);

      setStats({
        today: todayRides?.length || 0,
        total: driver.total_rides || 0,
        rating: driver.rating || 5.0,
      });
    } catch (error) {
      console.error('Error fetching driver data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user.id]);

  useEffect(() => {
    fetchDriverData();

    // Subscribe to ride updates
    const subscription = supabase
      .channel('driver-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rides' },
        () => fetchDriverData()
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchDriverData]);

  const toggleAvailability = async () => {
    if (activeRide) {
      Alert.alert('Cannot Change', 'Complete your current ride first');
      return;
    }

    try {
      const newStatus = isAvailable ? 'offline' : 'available';
      
      await supabase
        .from('drivers')
        .update({ status: newStatus })
        .eq('id', driverData.id);

      await supabase
        .from('vehicles')
        .update({ status: newStatus === 'available' ? 'available' : 'offline' })
        .eq('id', driverData.vehicle_id);

      setIsAvailable(!isAvailable);
      fetchDriverData();
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', 'Failed to update status');
    }
  };

  const acceptRide = async (ride) => {
    try {
      // Update ride
      const { error: rideError } = await supabase
        .from('rides')
        .update({
          driver_id: driverData.id,
          vehicle_id: driverData.vehicle_id,
          status: 'accepted',
          accepted_at: new Date().toISOString(),
          distance_km: ride.distance,
          estimated_duration_minutes: Math.ceil((ride.distance || 0.5) * 3),
          allocation_method: 'driver_accepted',
          ai_score: 100 - (ride.distance || 0) * 10,
        })
        .eq('id', ride.id)
        .eq('status', 'pending'); // Only update if still pending

      if (rideError) throw rideError;

      // Update driver status
      await supabase
        .from('drivers')
        .update({ status: 'busy' })
        .eq('id', driverData.id);

      // Update vehicle status
      await supabase
        .from('vehicles')
        .update({ status: 'in_transit', current_passengers: 1 })
        .eq('id', driverData.vehicle_id);

      Alert.alert('Ride Accepted! 🎉', `Navigate to: ${ride.pickup_location?.name}`);
      fetchDriverData();
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', 'Failed to accept ride. It may have been taken.');
      fetchDriverData();
    }
  };

  const updateRideStatus = async (newStatus) => {
    if (!activeRide) return;

    try {
      const updates = { status: newStatus };

      if (newStatus === 'in_progress') {
        updates.started_at = new Date().toISOString();
      } else if (newStatus === 'completed') {
        updates.completed_at = new Date().toISOString();
        if (activeRide.started_at) {
          const duration = (new Date() - new Date(activeRide.started_at)) / 60000;
          updates.actual_duration_minutes = Math.round(duration);
        }
      }

      await supabase.from('rides').update(updates).eq('id', activeRide.id);

      if (newStatus === 'completed') {
        // Update driver
        await supabase
          .from('drivers')
          .update({
            status: 'available',
            total_rides: (driverData.total_rides || 0) + 1,
          })
          .eq('id', driverData.id);

        // Update vehicle
        await supabase
          .from('vehicles')
          .update({ status: 'available', current_passengers: 0 })
          .eq('id', driverData.vehicle_id);

        Alert.alert('Ride Completed! 🎉', 'Great job! You can now accept new rides.');
      }

      fetchDriverData();
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', 'Failed to update ride status');
    }
  };

  const callPassenger = () => {
    if (activeRide?.passenger?.phone) {
      Linking.openURL(`tel:${activeRide.passenger.phone}`);
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', onPress: signOut, style: 'destructive' },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading driver data...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            fetchDriverData();
          }}
          colors={[COLORS.secondary]}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Driver Mode</Text>
          <Text style={styles.userName}>{user?.full_name} 🚗</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>🚪</Text>
        </TouchableOpacity>
      </View>

      {/* Vehicle Card */}
      {driverData?.vehicle && (
        <View style={styles.vehicleCard}>
          <Text style={styles.vehicleEmoji}>🚐</Text>
          <View style={styles.vehicleDetails}>
            <Text style={styles.vehicleName}>{driverData.vehicle.vehicle_name}</Text>
            <Text style={styles.vehicleNumber}>{driverData.vehicle.vehicle_number}</Text>
          </View>
          <View style={styles.capacityBadge}>
            <Text style={styles.capacityText}>👥 {driverData.vehicle.capacity}</Text>
          </View>
        </View>
      )}

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statBoxValue}>{stats.today}</Text>
          <Text style={styles.statBoxLabel}>Today</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statBoxValue}>{stats.total}</Text>
          <Text style={styles.statBoxLabel}>Total Rides</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statBoxValue}>⭐ {stats.rating.toFixed(1)}</Text>
          <Text style={styles.statBoxLabel}>Rating</Text>
        </View>
      </View>

      {/* Availability Toggle */}
      <View style={styles.toggleCard}>
        <View style={styles.toggleInfo}>
          <Text style={styles.toggleStatus}>
            {isAvailable ? '🟢 Online' : '🔴 Offline'}
          </Text>
          <Text style={styles.toggleSubtext}>
            {isAvailable ? 'Receiving ride requests' : 'Not receiving requests'}
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.toggleButton,
            isAvailable ? styles.toggleButtonOff : styles.toggleButtonOn,
          ]}
          onPress={toggleAvailability}
          disabled={activeRide !== null}
        >
          <Text style={styles.toggleButtonText}>
            {isAvailable ? 'Go Offline' : 'Go Online'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Active Ride */}
      {activeRide && (
        <View style={styles.activeRideCard}>
          <View style={styles.activeRideHeader}>
            <Text style={styles.activeRideTitle}>🚗 Current Ride</Text>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(activeRide.status) }]}>
              <Text style={styles.statusBadgeText}>{activeRide.status}</Text>
            </View>
          </View>

          {/* Passenger Info */}
          <View style={styles.passengerCard}>
            <View style={styles.passengerAvatar}>
              <Text style={styles.passengerAvatarText}>
                {activeRide.passenger?.full_name?.charAt(0) || 'P'}
              </Text>
            </View>
            <View style={styles.passengerInfo}>
              <Text style={styles.passengerName}>{activeRide.passenger?.full_name}</Text>
              <Text style={styles.passengerPhone}>{activeRide.passenger?.phone}</Text>
            </View>
            <TouchableOpacity style={styles.callButton} onPress={callPassenger}>
              <Text style={styles.callButtonText}>📞</Text>
            </TouchableOpacity>
          </View>

          {/* Route */}
          <View style={styles.routeCard}>
            <View style={styles.routeRow}>
              <Text style={styles.routeIcon}>📍</Text>
              <View style={styles.routeInfo}>
                <Text style={styles.routeLabel}>PICKUP</Text>
                <Text style={styles.routeValue}>{activeRide.pickup_location?.name}</Text>
              </View>
            </View>
            <View style={styles.routeLine} />
            <View style={styles.routeRow}>
              <Text style={styles.routeIcon}>🎯</Text>
              <View style={styles.routeInfo}>
                <Text style={styles.routeLabel}>DROP-OFF</Text>
                <Text style={styles.routeValue}>{activeRide.dropoff_location?.name}</Text>
              </View>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            {activeRide.status === 'accepted' && (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: COLORS.warning }]}
                onPress={() => updateRideStatus('arriving')}
              >
                <Text style={styles.actionButtonText}>📍 Arriving at Pickup</Text>
              </TouchableOpacity>
            )}
            {activeRide.status === 'arriving' && (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: COLORS.info }]}
                onPress={() => updateRideStatus('in_progress')}
              >
                <Text style={styles.actionButtonText}>🚀 Start Trip</Text>
              </TouchableOpacity>
            )}
            {activeRide.status === 'in_progress' && (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: COLORS.secondary }]}
                onPress={() => updateRideStatus('completed')}
              >
                <Text style={styles.actionButtonText}>✅ Complete Ride</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Pending Rides */}
      {isAvailable && !activeRide && (
        <View style={styles.pendingSection}>
          <Text style={styles.sectionTitle}>📋 Available Requests ({pendingRides.length})</Text>
          {pendingRides.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>⏳</Text>
              <Text style={styles.emptyText}>No pending requests</Text>
              <Text style={styles.emptySubtext}>New ride requests will appear here</Text>
            </View>
          ) : (
            pendingRides.map((ride) => (
              <View key={ride.id} style={styles.pendingCard}>
                <View style={styles.pendingHeader}>
                  <View style={styles.pendingPassenger}>
                    <Text style={styles.pendingPassengerIcon}>👤</Text>
                    <Text style={styles.pendingPassengerName}>{ride.passenger?.full_name}</Text>
                  </View>
                  <Text style={styles.pendingDistance}>{formatDistance(ride.distance)} away</Text>
                </View>
                <View style={styles.pendingRoute}>
                  <Text style={styles.pendingRouteText}>
                    📍 {ride.pickup_location?.name} → 🎯 {ride.dropoff_location?.name}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.acceptButton}
                  onPress={() => acceptRide(ride)}
                >
                  <Text style={styles.acceptButtonText}>✓ Accept Ride</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      )}

      <View style={{ height: 30 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.light,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.gray,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    backgroundColor: COLORS.secondary,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  greeting: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
  },
  userName: {
    color: COLORS.white,
    fontSize: 26,
    fontWeight: 'bold',
  },
  logoutButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutButtonText: {
    fontSize: 22,
  },
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    marginHorizontal: 20,
    marginTop: -20,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  vehicleEmoji: {
    fontSize: 40,
  },
  vehicleDetails: {
    flex: 1,
    marginLeft: 12,
  },
  vehicleName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.dark,
  },
  vehicleNumber: {
    fontSize: 14,
    color: COLORS.gray,
  },
  capacityBadge: {
    backgroundColor: COLORS.light,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  capacityText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.dark,
  },
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 20,
  },
  statBox: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  statBoxValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.dark,
  },
  statBoxLabel: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 4,
  },
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 16,
    padding: 20,
  },
  toggleInfo: {
    flex: 1,
  },
  toggleStatus: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.dark,
  },
  toggleSubtext: {
    fontSize: 13,
    color: COLORS.gray,
    marginTop: 2,
  },
  toggleButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
  },
  toggleButtonOn: {
    backgroundColor: COLORS.secondary,
  },
  toggleButtonOff: {
    backgroundColor: COLORS.danger,
  },
  toggleButtonText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: 14,
  },
  activeRideCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  activeRideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
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
  statusBadgeText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  passengerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  passengerAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  passengerAvatarText: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: 'bold',
  },
  passengerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  passengerName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.dark,
  },
  passengerPhone: {
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
  routeCard: {
    backgroundColor: COLORS.light,
    borderRadius: 12,
    padding: 16,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  routeIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  routeInfo: {
    flex: 1,
  },
  routeLabel: {
    fontSize: 11,
    color: COLORS.gray,
    fontWeight: '600',
  },
  routeValue: {
    fontSize: 15,
    color: COLORS.dark,
    fontWeight: '500',
  },
  routeLine: {
    height: 20,
    width: 2,
    backgroundColor: COLORS.lightGray,
    marginLeft: 9,
    marginVertical: 4,
  },
  actionButtons: {
    marginTop: 16,
  },
  actionButton: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  actionButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  pendingSection: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.dark,
    marginBottom: 16,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: COLORS.white,
    borderRadius: 16,
  },
  emptyIcon: {
    fontSize: 50,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.dark,
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.gray,
    marginTop: 4,
  },
  pendingCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  pendingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  pendingPassenger: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pendingPassengerIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  pendingPassengerName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.dark,
  },
  pendingDistance: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
  },
  pendingRoute: {
    marginBottom: 12,
  },
  pendingRouteText: {
    fontSize: 14,
    color: COLORS.gray,
  },
  acceptButton: {
    backgroundColor: COLORS.secondary,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  acceptButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default DriverHomeScreen;