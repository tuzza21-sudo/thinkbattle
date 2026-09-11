import { useCallback, useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track, createLocalAudioTrack, type LocalAudioTrack } from 'livekit-client';
import { supabase } from './supabase';

export const useSessionAudio = (roomId: string, enabled: boolean, audibleIds: string[]) => {
  const room = useRef<Room | null>(null);
  const localTrack = useRef<LocalAudioTrack | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const elements = useRef(new Map<HTMLMediaElement, string>());
  const allowed = useRef(audibleIds);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionVersion = useRef(0);
  const connectionPending = useRef(false);
  const [connected, setConnected] = useState(false);
  const [recording, setRecording] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { allowed.current = audibleIds; elements.current.forEach((id, element) => { element.muted = !audibleIds.includes(id); }); }, [audibleIds]);
  const stop = useCallback(() => {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    if (recorder.current?.state === 'recording') recorder.current.stop();
    localTrack.current?.mediaStreamTrack.stop();
    if (localTrack.current) void room.current?.localParticipant.unpublishTrack(localTrack.current);
    localTrack.current = null;
    setRecording(false);
  }, []);
  const connect = useCallback(async () => {
    if (!enabled || connectionPending.current) return;
    connectionPending.current = true;
    const version = connectionVersion.current;
    setConnecting(true); setError('');
    try {
      if (room.current) { await room.current.startAudio(); return; }
      const { data } = await supabase.auth.getSession();
      const response = await fetch('/api/livekit-token', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify({ roomName: roomId }) });
      const credentials = await response.json();
      if (version !== connectionVersion.current) return;
      if (!response.ok) throw new Error(credentials.error || '음성 연결에 실패했습니다.');
      const nextRoom = new Room();
      room.current = nextRoom;
      nextRoom.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        if (track.kind !== Track.Kind.Audio) return;
        const element = track.attach(); element.muted = !allowed.current.includes(participant.identity);
        elements.current.set(element, participant.identity); document.body.appendChild(element);
      });
      nextRoom.on(RoomEvent.TrackUnsubscribed, track => track.detach().forEach(element => { elements.current.delete(element); element.remove(); }));
      nextRoom.on(RoomEvent.Reconnecting, () => { setConnected(false); stop(); });
      nextRoom.on(RoomEvent.Reconnected, () => setConnected(true));
      nextRoom.on(RoomEvent.Disconnected, () => { if (room.current === nextRoom) { setConnected(false); stop(); room.current = null; } });
      await nextRoom.connect(credentials.url, credentials.token);
      if (version !== connectionVersion.current) { void nextRoom.disconnect(); return; }
      await nextRoom.startAudio(); setConnected(true);
    } catch (err) {
      if (room.current) { void room.current.disconnect(); room.current = null; }
      setError(err instanceof Error ? err.message : '음성 연결에 실패했습니다.');
    } finally { connectionPending.current = false; setConnecting(false); }
  }, [enabled, roomId, stop]);
  const start = async (onRecorded: (blob: Blob) => void) => {
    if (!room.current || !connected) throw new Error('먼저 음성 연결을 눌러 주세요.');
    const currentRoom = room.current;
    const track = await createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
    if (room.current !== currentRoom) { track.stop(); throw new Error('음성 연결이 바뀌었습니다. 다시 연결해 주세요.'); }
    localTrack.current = track;
    try {
      await room.current.localParticipant.publishTrack(track);
      const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(value => MediaRecorder.isTypeSupported(value));
      const next = new MediaRecorder(new MediaStream([track.mediaStreamTrack]), type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      next.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      next.onstop = () => { setRecording(false); onRecorded(new Blob(chunks, { type: next.mimeType })); };
      recorder.current = next; next.start(1000); setRecording(true);
      // Short recordings keep transcript processing bounded; another speech can follow immediately.
      stopTimer.current = setTimeout(stop, 60_000);
    } catch (err) { track.stop(); void room.current?.localParticipant.unpublishTrack(track); localTrack.current = null; throw err; }
  };
  useEffect(() => {
    const attached = elements.current;
    const version = connectionVersion.current;
    return () => {
      connectionVersion.current = version + 1;
      if (stopTimer.current) clearTimeout(stopTimer.current);
      if (recorder.current) { recorder.current.onstop = null; if (recorder.current.state === 'recording') recorder.current.stop(); }
      localTrack.current?.stop(); void room.current?.disconnect(); room.current = null;
      attached.forEach((_id, element) => element.remove()); attached.clear();
    };
  }, [roomId]);
  return { connected, connecting, recording, error, connect, start, stop };
};
