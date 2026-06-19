import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { X, Send } from 'lucide-react-native';
import { firestore, auth } from '@/config/firebase';
import {
  sendDriverMessage,
  getAllMessages,
  markMessagesAsSeen,
} from '@/utils/chat';

const { width, height } = Dimensions.get('window');

interface ChatPanelProps {
  visible: boolean;
  onClose: () => void;
  rideId: string | null;
  clientName: string;
  clientId: string;
  driverName: string;
  pickupAddress: string;
  destinationAddress: string;
  rideStatus: string | null;
}

export default function ChatPanel({
  visible,
  onClose,
  rideId,
  clientName,
  clientId,
  driverName,
  pickupAddress,
  destinationAddress,
  rideStatus,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<Array<{ id: string; data: any }>>([]);
  const [inputText, setInputText] = useState('');
  const scrollViewRef = useRef<ScrollView>(null);
  const driverId = auth.currentUser?.uid || '';

  useEffect(() => {
    if (!visible || !rideId) {
      return;
    }

    const unsubscribe = getAllMessages(firestore, rideId, (msgs) => {
      setMessages(msgs);

      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });

    markMessagesAsSeen(firestore, rideId);

    return () => {
      unsubscribe();
    };
  }, [visible, rideId]);

  const handleSend = () => {
    if (!inputText.trim() || !rideId || !driverName || !rideStatus) return;

    const validStatuses = ['accepted', 'arrived', 'started'];
    if (!validStatuses.includes(rideStatus)) return;

    sendDriverMessage(firestore, rideId, driverId, driverName, inputText.trim());
    setInputText('');

    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  if (!visible) return null;

  const canSendMessages = rideId && rideStatus && ['accepted', 'arrived', 'started'].includes(rideStatus);

  return (
    <View style={styles.overlay}>
      <BlurView intensity={30} style={styles.blurOverlay}>
        <TouchableOpacity
          style={styles.backdropTouchable}
          activeOpacity={1}
          onPress={onClose}
        />
      </BlurView>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.panelContainer}
      >
        <View style={styles.panel}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.clientName}>{clientName}</Text>
              <Text style={styles.tripInfo} numberOfLines={1}>
                Pickup → Destination
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X color="#333" size={24} />
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesContainer}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
          >
            {messages.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No messages yet</Text>
                <Text style={styles.emptySubtext}>
                  Send a message to start the conversation
                </Text>
              </View>
            )}
            {messages.map((msg) => {
              const isDriver = msg.data.sender === 'driver';
              const senderName = msg.data.senderName || (isDriver ? 'Driver' : 'Client');
              return (
                <View
                  key={msg.id}
                  style={[
                    styles.messageBubble,
                    isDriver ? styles.driverBubble : styles.clientBubble,
                  ]}
                >
                  <Text style={styles.senderName}>
                    {senderName}
                  </Text>
                  <Text
                    style={[
                      styles.messageText,
                      isDriver ? styles.driverText : styles.clientText,
                    ]}
                  >
                    {msg.data.text}
                  </Text>
                  <Text
                    style={[
                      styles.timestamp,
                      isDriver ? styles.timestampDriver : styles.timestampClient,
                    ]}
                  >
                    {new Date(msg.data.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.inputContainer}>
            <TextInput
              style={[styles.textInput, !canSendMessages && styles.textInputDisabled]}
              placeholder={canSendMessages ? "Type a message..." : "Messages unavailable"}
              placeholderTextColor="#999"
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={500}
              editable={canSendMessages}
            />
            <TouchableOpacity
              onPress={handleSend}
              style={[
                styles.sendButton,
                (!inputText.trim() || !canSendMessages) && styles.sendButtonDisabled,
              ]}
              disabled={!inputText.trim() || !canSendMessages}
            >
              <Send
                color={(inputText.trim() && canSendMessages) ? '#fff' : '#ccc'}
                size={20}
                fill={(inputText.trim() && canSendMessages) ? '#fff' : 'transparent'}
              />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  blurOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  backdropTouchable: {
    flex: 1,
  },
  panelContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: height * 0.4,
    zIndex: 1001,
  },
  panel: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  headerLeft: {
    flex: 1,
    marginRight: 12,
  },
  clientName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  tripInfo: {
    fontSize: 13,
    color: '#666',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  messagesContainer: {
    flex: 1,
    backgroundColor: '#F9F9F9',
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 8,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#999',
    marginBottom: 6,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#BBB',
  },
  messageBubble: {
    maxWidth: '75%',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    marginBottom: 12,
  },
  driverBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#E8E8E8',
    borderBottomLeftRadius: 4,
  },
  clientBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#00C853',
    borderBottomRightRadius: 4,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    opacity: 0.8,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
    marginBottom: 4,
  },
  driverText: {
    color: '#fff',
  },
  clientText: {
    color: '#fff',
  },
  timestamp: {
    fontSize: 11,
    marginTop: 2,
  },
  timestampDriver: {
    color: 'rgba(255, 255, 255, 0.75)',
    textAlign: 'right',
  },
  timestampClient: {
    color: '#888',
    textAlign: 'left',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 32 : 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    color: '#000',
    marginRight: 10,
  },
  textInputDisabled: {
    backgroundColor: '#E8E8E8',
    opacity: 0.6,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#00C853',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#E8E8E8',
  },
});

