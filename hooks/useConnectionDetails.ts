import { useCallback, useEffect, useState } from 'react';
import { ConnectionDetails } from '@/app/api/connection-details/route';

export default function useConnectionDetails(agentName?: string) {
  // Generate room connection details, including:
  //   - A random Room name
  //   - A random Participant name
  //   - An Access Token to permit the participant to join the room
  //   - The URL of the LiveKit server to connect to
  //
  // In real-world application, you would likely allow the user to specify their
  // own participant name, and possibly to choose from existing rooms to join.

  const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails | null>(null);

  const fetchConnectionDetails = useCallback(() => {
    setConnectionDetails(null);
    const url = new URL(
      process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT ?? '/api/connection-details',
      window.location.origin
    );
    const envAgentName = process.env.NEXT_PUBLIC_AGENT_NAME;
    const finalAgentName = agentName ?? envAgentName;
    if (finalAgentName) {
      url.searchParams.set('agentName', finalAgentName);
    }
    fetch(url.toString())
      .then((res) => res.json())
      .then((data) => {
        setConnectionDetails(data);
      })
      .catch((error) => {
        console.error('Error fetching connection details:', error);
      });
  }, [agentName]);

  // Note: do not auto-fetch on mount. Call refreshConnectionDetails
  // when the user starts the call, to avoid pre-dispatching the agent.

  return { connectionDetails, refreshConnectionDetails: fetchConnectionDetails };
}
