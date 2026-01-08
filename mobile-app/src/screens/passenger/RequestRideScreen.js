// src/screens/passenger/RequestRideScreen.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import * as Location from 'expo-location';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabase';
import { COLORS, CAMPUS_CENTER } from '../../utils/constants';
import { calculateDistance, formatDistance } from '../../utils/helpers';

const RequestRideScreen = ({ navigation }) => {
  const { user } = useAuth();
  const [locations, setLocations] = useState([]);
  const [pickupLocation, setPickupLocation] = useState(null);
  const [dropoffLocation, setDropoffLocation] = useState(null);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [showPickupModal, setShowPickupModal] = useState(false);
  const [showDropoffModal, setShowDropoffModal] = useState(false);

  useEffect(() => {
    fetchLocations();
    getCurrentLocation();
  }, []);

  const fetchLocations = async () => {
    try {
      const { data, error } = await supabase
        .from('campus_locations')
        .select('*')
        .eq('is_shuttle_stop', true)
        .order('name');

      if (error) throw error;
      setLocations(data || []);
    } catch (error) {
      console.error('Error fetching locations:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required to request rides');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      setCurrentLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      // Find nearest location as default pickup
      if (locations.length > 0) {
        const nearest = findNearestLocation(location.coords.latitude, location.coords.longitude);
        setPickupLocation(nearest);
      }
    } catch (error) {
      console.error('Error getting location:', error);
      // Use campus center as fallback
      setCurrentLocation(CAMPUS_CENTER);
    }
  };

  const findNearestLocation = (lat, lon) => {
    let nearest = locations[0];
    let minDistance = calculateDistance(lat, lon, locations[0].latitude, locations[0].longitude);

    locations.forEach((loc) => {
      const distance = calculateDistance(lat, lon, loc.latitude, loc.longitude);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = loc;
      }
    });

    return { ...nearest, distance: minDistance };
  };

  const handleRequestRide = async () => {
    if (!pickupLocation || !dropoffLocation) {
      Alert.alert('Error', 'Please select both pickup and dropoff locations');
      return;
    }

    if (pickupLocation.id === dropoffLocation.id) {
      Alert.alert('Error', 'Pickup and dropoff locations must be different');
      return;
    }

    setRequesting(true);

    try {
      // Create ride request
      const { data: rideData, error: rideError } = await supabase
        .from('rides')
        .insert({
          passenger_id: user.id,
          pickup_location_id: pickupLocation.id,
          pickup_latitude: pickupLocation.latitude,
          pickup_longitude: pickupLocation.longitude,
          pickup_address: pickupLocation.name,
          dropoff_location_id: dropoffLocation.id,
          dropoff_latitude: dropoffLocation.latitude,
          dropoff_longitude: dropoffLocation.longitude,
          dropoff_address: dropoffLocation.name,
          status: 'pending',
        })
        .select()
        .single();

      if (rideError) throw rideError;

      // Call AI allocation function
      const { data: allocationData, error: allocationError } = await supabase
        .rpc('allocate_ride', { p_ride_id: rideData.id });

      if (allocationError) {
        console.log('Allocation info:', allocationError);
        // Ride is still created, just waiting for manual allocation
      }

      Alert.alert(
        'Ride Requested! 🚐',
        allocationData?.success 
          ? `Your ride has been assigned to ${allocationData.driver_name}`
          : 'Looking for available drivers...',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error) {
      console.error('Error requesting ride:', error);
      Alert.alert('Error', 'Failed to request ride. Please try again.');
    } finally {
      setRequesting(false);
    }
  };

  const LocationModal = ({ visible, onClose, onSelect, title, selectedId }) => (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={locations}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const distance = currentLocation
                ? calculateDistance(
                    currentLocation.latitude,
                    currentLocation.longitude,
                    item.latitude,
                    item.longitude
                  )
                : null;
              const isSelected = item.id === selectedId;

              return (
                <TouchableOpacity
                  style={[styles.locationItem, isSelected && styles.locationItemSelected]}
                  onPress={() => {
                    onSelect({ ...item, distance });
                    onClose();
                  }}
                >
                  <View style={styles.locationItemLeft}>
                    <Text style={styles.locationItemIcon}>📍</Text>
                    <View>
                      <Text style={styles.locationItemName}>{item.name}</Text>
                      <Text style={styles.locationItemType}>{item.location_type}</Text>
                    </View>
                  </View>
                  {distance !== null && (
                    <Text style={styles.locationItemDistance}>{formatDistance(distance)}</Text>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Request Ride</Text>
      </View>

      <View style={styles.content}>
        {/* Pickup Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pickup Location</Text>
          <TouchableOpacity
            style={styles.locationSelector}
            onPress={() => setShowPickupModal(true)}
          >
            <Text style={styles.locationIcon}>📍</Text>
            <View style={styles.locationTextContainer}>
              {pickupLocation ? (
                <>
                  <Text style={styles.locationName}>{pickupLocation.name}</Text>
                  {pickupLocation.distance && (
                    <Text style={styles.locationDistance}>
                      {formatDistance(pickupLocation.distance)} away
                    </Text>
                  )}
                </>
              ) : (
                <Text style={styles.locationPlaceholder}>Select pickup location</Text>
              )}
            </View>
            <Text style={styles.changeText}>Change</Text>
          </TouchableOpacity>
        </View>

        {/* Route Line */}
        <View style={styles.routeLine}>
          <View style={styles.routeDot} />
          <View style={styles.routeDash} />
          <View style={styles.routeDash} />
          <View style={styles.routeDash} />
          <View style={[styles.routeDot, { backgroundColor: COLORS.secondary }]} />
        </View>

        {/* Dropoff Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dropoff Location</Text>
          <TouchableOpacity
            style={styles.locationSelector}
            onPress={() => setShowDropoffModal(true)}
          >
            <Text style={styles.locationIcon}>🎯</Text>
            <View style={styles.locationTextContainer}>
              {dropoffLocation ? (
                <>
                  <Text style={styles.locationName}>{dropoffLocation.name}</Text>
                  <Text style={styles.locationDistance}>{dropoffLocation.location_type}</Text>
                </>
              ) : (
                <Text style={styles.locationPlaceholder}>Select dropoff location</Text>
              )}
            </View>
            <Text style={styles.changeText}>Change</Text>
          </TouchableOpacity>
        </View>

        {/* Ride Summary */}
        {pickupLocation && dropoffLocation && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Ride Summary</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Distance</Text>
              <Text style={styles.summaryValue}>
                {formatDistance(
                  calculateDistance(
                    pickupLocation.latitude,
                    pickupLocation.longitude,
                    dropoffLocation.latitude,
                    dropoffLocation.longitude
                  )
                )}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Est. Time</Text>
              <Text style={styles.summaryValue}>
                {Math.ceil(
                  calculateDistance(
                    pickupLocation.latitude,
                    pickupLocation.longitude,
                    dropoffLocation.latitude,
                    dropoffLocation.longitude
                  ) * 3
                )}{' '}
                min
              </Text>
            </View>
          </View>
        )}

        {/* Request Button */}
        <TouchableOpacity
          style={[
            styles.requestButton,
            (!pickupLocation || !dropoffLocation) && styles.requestButtonDisabled,
          ]}
          onPress={handleRequestRide}
          disabled={!pickupLocation || !dropoffLocation || requesting}
        >
          {requesting ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Text style={styles.requestButtonText}>Request Shuttle 🚐</Text>
          )}
        </TouchableOpacity>
      </View>

      <LocationModal
        visible={showPickupModal}
        onClose={() => setShowPickupModal(false)}
        onSelect={setPickupLocation}
        title="Select Pickup Location"
        selectedId={pickupLocation?.id}
      />

      <LocationModal
        visible={showDropoffModal}
        onClose={() => setShowDropoffModal(false)}
        onSelect={setDropoffLocation}
        title="Select Dropoff Location"
        selectedId={dropoffLocation?.id}
      />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    backgroundColor: COLORS.white,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.light,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  backButtonText: {
    fontSize: 24,
    color: COLORS.dark,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.dark,
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray,
    marginBottom: 10,
  },
  locationSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 15,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  locationIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  locationTextContainer: {
    flex: 1,
  },
  locationName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.dark,
  },
  locationDistance: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 2,
  },
  locationPlaceholder: {
    fontSize: 16,
    color: COLORS.gray,
  },
  changeText: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  routeLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingLeft: 35,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
  },
  routeDash: {
    width: 20,
    height: 2,
    backgroundColor: COLORS.lightGray,
    marginHorizontal: 3,
  },
  summaryCard: {
    backgroundColor: COLORS.white,
    borderRadius: 15,
    padding: 20,
    marginTop: 20,
    marginBottom: 20,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.dark,
    marginBottom: 15,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  summaryLabel: {
    color: COLORS.gray,
  },
  summaryValue: {
    fontWeight: '600',
    color: COLORS.dark,
  },
  requestButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 15,
    padding: 18,
    alignItems: 'center',
    marginTop: 10,
  },
  requestButtonDisabled: {
    backgroundColor: COLORS.lightGray,
  },
  requestButtonText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.dark,
  },
  closeButton: {
    fontSize: 24,
    color: COLORS.gray,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  locationItemSelected: {
    backgroundColor: COLORS.primary + '10',
  },
  locationItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  locationItemIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  locationItemName: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.dark,
  },
  locationItemType: {
    fontSize: 12,
    color: COLORS.gray,
    textTransform: 'capitalize',
  },
  locationItemDistance: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '500',
  },
});

export default RequestRideScreen;