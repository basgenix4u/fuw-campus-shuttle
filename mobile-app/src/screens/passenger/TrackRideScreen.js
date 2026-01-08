// src/screens/passenger/TrackRideScreen.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
} from 'react-native';
import { supabase } from '../../services/supabase';
import { COLORS } from '../../utils/constants';
import { formatDistance, getStatusColor, getStatusText } from '../../utils/helpers';

const TrackRideScreen = ({ route, navigation }) => {
  const { rideId } = route.params;
  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRide();
    subscribeToRide();
  }, []);

  const fetchRide = async () => {
    try {
      const { data, error } = await supabase
        .from('rides')
        .select(`
          *,
          driver:drivers(
            id,
            user:users(full_name, phone),
            vehicle:vehicles(vehicle_name, vehicle_number)
          ),
          pickup_location:campus_locations!rides_pickup_location_id_fkey(name),
          dropoff_location:campus_locations!rides_dropoff_location_id_fkey(name)
        `)
        .eq('id', rideId)
        .single();

      if (error) throw error;
      setRide(data);
    } catch (error) {
      console.error('Error fetching ride:', error);
    } finally {
      setLoading(false);
    }
  };

  const subscribeToRide = () => {
    const subscription = supabase
      .channel('track-ride-' + rideId)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rides',
          filter: `id=eq.${rideId}`,
        },
        (payload) => {
          console.log('Ride updated:', payload.new.status);
          fetchRide();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  };

  const callDriver = () => {
    if (ride?.driver?.user?.phone) {
      Linking.openURL(`tel:${ride.driver.user.phone}`);
    }
  };

  const getProgressSteps = () => {
    const steps = [
      { id: 'pending', label: 'Requested', icon: '📝', description: 'Finding a driver' },
      { id: 'accepted', label: 'Accepted', icon: '✅', description: 'Driver assigned' },
      { id: 'arriving', label: 'Arriving', icon: '🚗', description: 'Driver on the way' },
      { id: 'in_progress', label: 'On Trip', icon: '🛣️', description: 'Heading to destination' },
      { id: 'completed', label: 'Completed', icon: '🎉', description: 'Ride finished' },
    ];

    const statusOrder = ['pending', 'accepted', 'arriving', 'in_progress', 'completed'];
    const currentIndex = statusOrder.indexOf(ride?.status || 'pending');

    return steps.map((step, index) => ({
      ...step,
      isCompleted: index < currentIndex,
      isCurrent: index === currentIndex,
      isPending: index > currentIndex,
    }));
  };

  if (loading || !ride) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading ride details...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Track Ride</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Status Card */}
        <View style={styles.statusCard}>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(ride.status) }]}>
            <Text style={styles.statusBadgeText}>{getStatusText(ride.status)}</Text>
          </View>
          {ride.estimated_duration_minutes && (
            <Text style={styles.etaText}>
              Estimated arrival: {ride.estimated_duration_minutes} min
            </Text>
          )}
        </View>

        {/* Progress Steps */}
        <View style={styles.progressCard}>
          <Text style={styles.progressTitle}>Ride Progress</Text>
          {getProgressSteps().map((step, index) => (
            <View key={step.id} style={styles.progressStep}>
              <View style={styles.progressLeft}>
                <View
                  style={[
                    styles.progressCircle,
                    step.isCompleted && styles.progressCircleCompleted,
                    step.isCurrent && styles.progressCircleCurrent,
                  ]}
                >
                  <Text style={styles.progressIcon}>
                    {step.isCompleted ? '✓' : step.icon}
                  </Text>
                </View>
                {index < 4 && (
                  <View
                    style={[
                      styles.progressLine,
                      step.isCompleted && styles.progressLineCompleted,
                    ]}
                  />
                )}
              </View>
              <View style={styles.progressRight}>
                <Text
                  style={[
                    styles.progressLabel,
                    (step.isCompleted || step.isCurrent) && styles.progressLabelActive,
                  ]}
                >
                  {step.label}
                </Text>
                <Text style={styles.progressDescription}>{step.description}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Route Card */}
        <View style={styles.routeCard}>
          <Text style={styles.routeTitle}>Route Details</Text>
          <View style={styles.routeItem}>
            <View style={[styles.routeDot, { backgroundColor: COLORS.primary }]} />
            <View style={styles.routeInfo}>
              <Text style={styles.routeLabel}>PICKUP</Text>
              <Text style={styles.routeValue}>
                {ride.pickup_location?.name || ride.pickup_address}
              </Text>
            </View>
          </View>
          <View style={styles.routeDivider} />
          <View style={styles.routeItem}>
            <View style={[styles.routeDot, { backgroundColor: COLORS.secondary }]} />
            <View style={styles.routeInfo}>
              <Text style={styles.routeLabel}>DROP-OFF</Text>
              <Text style={styles.routeValue}>
                {ride.dropoff_location?.name || ride.dropoff_address}
              </Text>
            </View>
          </View>
        </View>

        {/* Driver Card */}
        {ride.driver && (
          <View style={styles.driverCard}>
            <Text style={styles.driverTitle}>Your Driver</Text>
            <View style={styles.driverInfo}>
              <View style={styles.driverAvatar}>
                <Text style={styles.driverAvatarText}>
                  {ride.driver.user?.full_name?.charAt(0) || 'D'}
                </Text>
              </View>
              <View style={styles.driverDetails}>
                <Text style={styles.driverName}>{ride.driver.user?.full_name}</Text>
                <Text style={styles.vehicleInfo}>
                  {ride.driver.vehicle?.vehicle_name} • {ride.driver.vehicle?.vehicle_number}
                </Text>
              </View>
              <TouchableOpacity style={styles.callButton} onPress={callDriver}>
                <Text style={styles.callButtonText}>📞 Call</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Ride Stats */}
        {ride.distance_km && (
          <View style={styles.statsCard}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatDistance(ride.distance_km)}</Text>
              <Text style={styles.statLabel}>Distance</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{ride.estimated_duration_minutes || '--'} min</Text>
              <Text style={styles.statLabel}>Est. Time</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{ride.ai_score?.toFixed(0) || '--'}%</Text>
              <Text style={styles.statLabel}>AI Score</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 50,
    backgroundColor: COLORS.white,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.light,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 24,
    color: COLORS.dark,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.dark,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  statusCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  statusBadge: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
  },
  statusBadgeText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  etaText: {
    marginTop: 12,
    color: COLORS.gray,
    fontSize: 14,
  },
  progressCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.dark,
    marginBottom: 20,
  },
  progressStep: {
    flexDirection: 'row',
    marginBottom: 0,
  },
  progressLeft: {
    alignItems: 'center',
    width: 40,
  },
  progressCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.lightGray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressCircleCompleted: {
    backgroundColor: COLORS.secondary,
  },
  progressCircleCurrent: {
    backgroundColor: COLORS.primary,
  },
  progressIcon: {
    fontSize: 16,
  },
  progressLine: {
    width: 2,
    height: 30,
    backgroundColor: COLORS.lightGray,
  },
  progressLineCompleted: {
    backgroundColor: COLORS.secondary,
  },
  progressRight: {
    flex: 1,
    paddingLeft: 12,
    paddingBottom: 24,
  },
  progressLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.gray,
  },
  progressLabelActive: {
    color: COLORS.dark,
  },
  progressDescription: {
    fontSize: 13,
    color: COLORS.gray,
    marginTop: 2,
  },
  routeCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  routeTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.dark,
    marginBottom: 16,
  },
  routeItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
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
    marginTop: 2,
  },
  routeDivider: {
    height: 20,
    width: 2,
    backgroundColor: COLORS.lightGray,
    marginLeft: 5,
    marginVertical: 8,
  },
  driverCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  driverTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.dark,
    marginBottom: 16,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
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
    fontSize: 13,
    color: COLORS.gray,
    marginTop: 2,
  },
  callButton: {
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  callButtonText: {
    color: COLORS.white,
    fontWeight: '600',
  },
  statsCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.dark,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: COLORS.lightGray,
  },
});

export default TrackRideScreen;