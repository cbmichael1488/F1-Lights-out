import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, StatusBar, Dimensions, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ref, push, onValue, query, orderByChild, limitToFirst, get, endAt } from 'firebase/database';
import { database } from './firebaseConfig';
import ConfettiCannon from 'react-native-confetti-cannon';
// ADDED Local Storage to remember the user's best time
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function App() {
  const [gameState, setGameState] = useState('IDLE'); 
  const [lights, setLights] = useState(0);
  const [reactionTime, setReactionTime] = useState(null);
  
  const [leaderboard, setLeaderboard] = useState([]);
  const [userRank, setUserRank] = useState(null); 
  const [initials, setInitials] = useState('');
  const [hasSubmittedScore, setHasSubmittedScore] = useState(false);
  
  // Persistent Personal Best State
  const [personalBest, setPersonalBest] = useState(null);
  const [personalRank, setPersonalRank] = useState(null);
  const [savedInitials, setSavedInitials] = useState('');
  
  const [showConfetti, setShowConfetti] = useState(false);
  const screenWidth = Dimensions.get('window').width;
  
  const timerRef = useRef(null);
  const timeoutRef = useRef(null);
  const startTimeRef = useRef(0);

  // 1. Load Personal Best on Boot & Listen for Top 3
  useEffect(() => {
    // Check local storage for previous bests
    const loadPersonalBest = async () => {
        try {
            const storedTime = await AsyncStorage.getItem('bestTime');
            const storedInitials = await AsyncStorage.getItem('initials');
            
            if (storedTime) {
                const time = parseInt(storedTime, 10);
                setPersonalBest(time);
                if (storedInitials) setSavedInitials(storedInitials);
                
                // Ask Firebase what rank this saved time is right now
                const rankQuery = query(ref(database, 'leaderboard'), orderByChild('time'), endAt(time - 1));
                const snapshot = await get(rankQuery);
                const currentRank = snapshot.exists() ? Object.keys(snapshot.val()).length + 1 : 1;
                setPersonalRank(currentRank);
            }
        } catch (e) {
            console.error("Failed to load local data");
        }
    };
    
    loadPersonalBest();

    // Listen to Firebase for the Top 3
    const scoresRef = query(ref(database, 'leaderboard'), orderByChild('time'), limitToFirst(3));
    const unsubscribe = onValue(scoresRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const formattedScores = Object.values(data).sort((a, b) => a.time - b.time);
        setLeaderboard(formattedScores);
      }
    });

    return () => {
      unsubscribe();
      clearInterval(timerRef.current);
      clearTimeout(timeoutRef.current);
    };
  }, []);

  const calculateRank = async (timeInMs) => {
    try {
        const rankQuery = query(ref(database, 'leaderboard'), orderByChild('time'), endAt(timeInMs - 1));
        const snapshot = await get(rankQuery);
        const rank = snapshot.exists() ? Object.keys(snapshot.val()).length + 1 : 1;
        setUserRank(rank);
    } catch (error) {
        setUserRank("?"); 
    }
  };

  const submitScore = async () => {
    if (initials.length > 0 && reactionTime !== null && !hasSubmittedScore) {
        const finalInitials = initials.toUpperCase().slice(0, 3);
        
        // Push to Cloud
        push(ref(database, 'leaderboard'), {
            time: reactionTime,
            initials: finalInitials,
            timestamp: Date.now()
        });
        
        setHasSubmittedScore(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Update Local Storage if it's a new personal best
        if (!personalBest || reactionTime < personalBest) {
            setPersonalBest(reactionTime);
            setPersonalRank(userRank);
            setSavedInitials(finalInitials);
            await AsyncStorage.setItem('bestTime', reactionTime.toString());
            await AsyncStorage.setItem('initials', finalInitials);
        }
    }
  };

  const startSequence = () => {
    setGameState('LIGHTING');
    setLights(0);
    setReactionTime(null);
    setUserRank(null); 
    setHasSubmittedScore(false);
    setShowConfetti(false); 
    
    // Auto-fill initials if they played before
    if (savedInitials) setInitials(savedInitials);
    else setInitials('');
    
    let currentLight = 0;
    
    setTimeout(() => {
        currentLight += 1;
        setLights(currentLight);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); 
    }, 1000);

    timerRef.current = setInterval(() => {
      currentLight += 1;
      
      if (currentLight <= 5) {
        setLights(currentLight);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
      
      if (currentLight === 5) {
        clearInterval(timerRef.current);
        const randomDelay = Math.floor(Math.random() * 2000) + 1000; 
        timeoutRef.current = setTimeout(() => {
          setLights(0);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); 
          startTimeRef.current = Date.now();
          setGameState('LIGHTS_OUT');
        }, randomDelay);
      }
    }, 1000);
  };

  const handleTap = () => {
    if (gameState === 'IDLE' || gameState === 'JUMP_START') {
      startSequence();
    } else if (gameState === 'LIGHTING') {
      clearInterval(timerRef.current);
      clearTimeout(timeoutRef.current);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setGameState('JUMP_START');
      setLights(0);
    } else if (gameState === 'LIGHTS_OUT') {
      const endTime = Date.now();
      const finalTime = endTime - startTimeRef.current;
      
      setReactionTime(finalTime);
      setGameState('RESULT');
      setShowConfetti(true); 
      
      calculateRank(finalTime);
    }
  };

  const getMessage = () => {
    switch (gameState) {
      case 'IDLE': return 'TAP TO START';
      case 'LIGHTING': return 'WAIT...';
      case 'LIGHTS_OUT': return 'GO!';
      case 'JUMP_START': return 'JUMP START! TAP TO RESTART';
      default: return '';
    }
  };

  const getMedalColor = (index) => {
      if (index === 0) return '#FFD700'; 
      if (index === 1) return '#C0C0C0'; 
      if (index === 2) return '#CD7F32'; 
      return '#ffffff';
  };

  // Decide what to show on the bottom row (Current Run vs Persistent Best)
  const displayRank = gameState === 'RESULT' ? userRank : personalRank;
  const displayTime = gameState === 'RESULT' ? reactionTime : personalBest;
  const displayInitials = gameState === 'RESULT' ? initials : savedInitials;

  return (
    <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Pressable style={styles.container} onPress={gameState === 'RESULT' ? null : handleTap}>
        <StatusBar barStyle="light-content" />
        
        <View style={styles.header}>
          <Text style={styles.title}>LIGHTS OUT</Text>
        </View>
        
        {/* LIGHTS MOVED TO THE TOP */}
        {gameState !== 'RESULT' && (
            <View style={styles.lightsContainer}>
            {[1, 2, 3, 4, 5].map((index) => (
                <View
                key={index}
                style={[
                    styles.light,
                    lights >= index ? styles.lightOn : styles.lightOff
                ]}
                />
            ))}
            </View>
        )}

        <View style={styles.messageContainer}>
          {gameState !== 'RESULT' && (
              <Text style={[styles.messageText, gameState === 'JUMP_START' && styles.errorText]}>
                {getMessage()}
              </Text>
          )}
          
          {reactionTime !== null && gameState === 'RESULT' && (
            <View style={styles.heroResultContainer}>
                <Text style={styles.resultLabel}>YOUR TIME</Text>
                <Text style={styles.timeText}>{(reactionTime / 1000).toFixed(3)} s</Text>
                
                {userRank ? (
                    <Text style={styles.heroRankText}>#{userRank}</Text>
                ) : (
                    <Text style={styles.calculatingText}>Locating rank...</Text>
                )}

                {!hasSubmittedScore ? (
                    <View style={styles.inputBlock}>
                        <TextInput 
                            style={styles.initialInput}
                            placeholder="AAA"
                            placeholderTextColor="#555"
                            maxLength={3}
                            autoCapitalize="characters"
                            value={initials}
                            onChangeText={setInitials}
                        />
                        <Pressable 
                            style={[styles.submitButton, initials.length < 1 && styles.submitButtonDisabled]} 
                            onPress={submitScore}
                            disabled={initials.length < 1}
                        >
                            <Text style={styles.submitButtonText}>SAVE</Text>
                        </Pressable>
                    </View>
                ) : (
                    <Pressable style={styles.restartButton} onPress={startSequence}>
                        <Text style={styles.restartButtonText}>PLAY AGAIN</Text>
                    </Pressable>
                )}
            </View>
          )}
        </View>

        {(gameState === 'IDLE' || gameState === 'RESULT') && leaderboard.length > 0 && (
            <View style={styles.leaderboardContainer}>
                <Text style={styles.leaderboardTitle}>🏆 GLOBAL PODIUM</Text>
                
                {leaderboard.map((score, index) => (
                    <View key={index} style={styles.leaderboardRow}>
                        <View style={styles.rankAndInitial}>
                            <Text style={[styles.leaderboardRank, { color: getMedalColor(index) }]}>#{index + 1}</Text>
                            <Text style={styles.leaderboardInitial}>{score.initials || '???'}</Text>
                        </View>
                        <Text style={styles.leaderboardTime}>{(score.time / 1000).toFixed(3)} s</Text>
                    </View>
                ))}

                {/* SHOW THE USER'S RANK (Either Current Run or Persistent Best) */}
                {displayTime && displayRank && displayRank > 3 && (
                    <View>
                        <View style={styles.divider} />
                        <View style={styles.leaderboardRow}>
                            <View style={styles.rankAndInitial}>
                                <Text style={[styles.leaderboardRank, styles.personalHighlight]}>#{displayRank}</Text>
                                <Text style={[styles.leaderboardInitial, styles.personalHighlight]}>
                                    {displayInitials || 'YOU'}
                                </Text>
                            </View>
                            <Text style={[styles.leaderboardTime, styles.personalHighlight]}>
                                {(displayTime / 1000).toFixed(3)} s
                            </Text>
                        </View>
                    </View>
                )}
            </View>
        )}
      </Pressable>

      {showConfetti && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <ConfettiCannon 
            count={120} 
            origin={{x: screenWidth / 2, y: -20}} 
            fallSpeed={3000}
            fadeOut={true}
            colors={['#e10600', '#ffffff', '#00ff88', '#ffd700']} 
          />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#15151e',
    alignItems: 'center',
    justifyContent: 'center', // Keeps the tap message in the center
  },
  header: {
    position: 'absolute',
    top: 80,
  },
  title: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 2,
  },
  // LIGHTS CONTAINER UPDATED HERE
  lightsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '80%',
    position: 'absolute', 
    top: 150, 
  },
  light: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#333',
  },
  lightOff: {
    backgroundColor: '#2a2a3d',
  },
  lightOn: {
    backgroundColor: '#e10600',
    borderColor: '#ff1e16',
    shadowColor: '#e10600',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 10,
  },
  messageContainer: {
    alignItems: 'center',
  },
  messageText: {
    color: '#888',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 1,
  },
  errorText: {
    color: '#e10600',
  },
  heroResultContainer: {
      alignItems: 'center',
      marginTop: -50,
  },
  resultLabel: {
      color: '#888',
      fontSize: 16,
      fontWeight: 'bold',
      letterSpacing: 3,
      marginBottom: 5,
  },
  timeText: {
    color: '#ffffff',
    fontSize: 72, 
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  heroRankText: {
      color: '#00ff88',
      fontSize: 42,
      fontWeight: '900',
      marginTop: -5,
      marginBottom: 20,
  },
  calculatingText: {
      color: '#555',
      fontSize: 18,
      fontStyle: 'italic',
      marginTop: 5,
      marginBottom: 20,
  },
  inputBlock: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 15,
  },
  initialInput: {
      backgroundColor: '#2a2a3d',
      color: '#ffffff',
      fontSize: 28,
      fontWeight: 'bold',
      textAlign: 'center',
      width: 100,
      height: 60,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: '#444',
  },
  submitButton: {
      backgroundColor: '#e10600',
      paddingVertical: 15,
      paddingHorizontal: 25,
      borderRadius: 10,
  },
  submitButtonDisabled: {
      backgroundColor: '#555',
  },
  submitButtonText: {
      color: 'white',
      fontWeight: 'bold',
      fontSize: 18,
  },
  restartButton: {
      backgroundColor: '#333',
      paddingVertical: 15,
      paddingHorizontal: 40,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#555',
  },
  restartButtonText: {
      color: 'white',
      fontWeight: 'bold',
      fontSize: 18,
      letterSpacing: 1,
  },
  leaderboardContainer: {
      position: 'absolute',
      bottom: 50,
      width: '80%',
      backgroundColor: '#1e1e2c',
      padding: 20,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: '#333',
  },
  leaderboardTitle: {
      color: '#888',
      fontSize: 14,
      fontWeight: 'bold',
      letterSpacing: 1,
      marginBottom: 15,
      textAlign: 'center',
  },
  leaderboardRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
  },
  rankAndInitial: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 15,
  },
  leaderboardRank: {
      fontSize: 20,
      fontWeight: '900',
      width: 35, 
  },
  leaderboardInitial: {
      color: '#ffffff',
      fontSize: 18,
      fontWeight: 'bold',
      letterSpacing: 2,
  },
  leaderboardTime: {
      color: '#e10600',
      fontWeight: 'bold',
      fontSize: 16,
      fontVariant: ['tabular-nums'],
  },
  divider: {
      height: 1,
      backgroundColor: '#333',
      marginVertical: 10,
  },
  personalHighlight: {
      color: '#00ff88',
  }
});