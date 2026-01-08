// src/context/AuthContext.js
import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '../services/supabase';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userDetails, setUserDetails] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      // For this project, we'll use custom auth (not Supabase Auth)
      // Check if user data exists in state
      setLoading(false);
    } catch (error) {
      console.error('Error checking user:', error);
      setLoading(false);
    }
  };

  const signIn = async (email, password) => {
    try {
      setLoading(true);
      
      // Query user from database
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email.toLowerCase())
        .eq('password_hash', password) // In production, use proper password hashing!
        .single();

      if (error) throw error;
      if (!data) throw new Error('Invalid email or password');

      setUser(data);
      setUserDetails(data);

      // If driver, get driver details
      if (data.role === 'driver') {
        const { data: driverData } = await supabase
          .from('drivers')
          .select('*, vehicles(*)')
          .eq('user_id', data.id)
          .single();
        
        setUserDetails({ ...data, driver: driverData });
      }

      return { success: true, user: data };
    } catch (error) {
      console.error('Sign in error:', error);
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email, password, fullName, phone, role = 'passenger') => {
    try {
      setLoading(true);

      // Check if user exists
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', email.toLowerCase())
        .single();

      if (existingUser) {
        throw new Error('Email already registered');
      }

      // Create new user
      const { data, error } = await supabase
        .from('users')
        .insert({
          email: email.toLowerCase(),
          password_hash: password, // In production, hash the password!
          full_name: fullName,
          phone: phone,
          role: role,
        })
        .select()
        .single();

      if (error) throw error;

      setUser(data);
      setUserDetails(data);

      return { success: true, user: data };
    } catch (error) {
      console.error('Sign up error:', error);
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setUser(null);
    setUserDetails(null);
  };

  const value = {
    user,
    userDetails,
    loading,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;