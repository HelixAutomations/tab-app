import React, { useState } from 'react';
import { Panel, PanelType } from '@fluentui/react/lib/Panel';
import { TextField } from '@fluentui/react/lib/TextField';
import { PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';
import { Stack } from '@fluentui/react/lib/Stack';
interface ExperimentalAssistantProps {
  isOpen: boolean;
  onDismiss: () => void;
  emailText: string;
}

const ExperimentalAssistant: React.FC<ExperimentalAssistantProps> = ({ isOpen, onDismiss, emailText }) => {
  const [prompt, setPrompt] = useState<string>('Check this email for typos and suggest improvements.');
  const [response, setResponse] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  async function runPrompt() {
    setLoading(true);
    // TODO: integrate with bespoke AI API
    setTimeout(() => {
      setResponse(
        `Pretend AI analysed your email:\n\n${emailText}\n\nPrompt used:\n${prompt}`
// invisible change
      );
      setLoading(false);
    }, 500);
  }

  return (
    <Panel
      isOpen={isOpen}
      onDismiss={onDismiss}
      headerText="AI Assistant"
      closeButtonAriaLabel="Close"
      type={PanelType.medium}
    >
      <Stack tokens={{ childrenGap: 10 }}>
        <TextField
          label="Prompt"
          multiline
          value={prompt}
          onChange={(_, val) => setPrompt(val || '')}
        />
        <PrimaryButton text={loading ? 'Running...' : 'Run'} onClick={runPrompt} disabled={loading} />
        <TextField label="Response" multiline value={response} readOnly />
        <DefaultButton text="Close" onClick={onDismiss} />
      </Stack>
    </Panel>
  );
};

export default ExperimentalAssistant;