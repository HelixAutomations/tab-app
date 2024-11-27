// src/EnquiryNotesEdits.tsx

import React, { useState } from 'react';
import {
  Dialog,
  DialogType,
  DialogFooter,
  PrimaryButton,
  DefaultButton,
  TextField,
  Text as FluentText, // Alias to avoid conflict
} from '@fluentui/react';
import { Enquiry } from '../../app/functionality/FeContext';
import { colours } from '../../app/styles/colours';
import EnquiryOverview from './EnquiryOverview';
import { useTheme } from '../../app/functionality/ThemeContext'; // Import useTheme

interface EnquiryNotesEditsProps {
  enquiry: Enquiry;
  onEditRating: (id: string) => void;
  onEditNotes: (id: string, notes: string) => void;
}

const EnquiryNotesEdits: React.FC<EnquiryNotesEditsProps> = ({
  enquiry,
  onEditRating,
  onEditNotes,
}) => {
  const { isDarkMode } = useTheme(); // Access isDarkMode from Theme Context
  const [isEditDialogVisible, setIsEditDialogVisible] = useState<boolean>(false);
  const [editedNotes, setEditedNotes] = useState<string>(
    enquiry.Initial_first_call_notes || ''
  );
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Handler to open the edit dialog
  const handleOpenEditDialog = () => {
    setEditedNotes(enquiry.Initial_first_call_notes || '');
    setIsEditDialogVisible(true);
  };

  // Handler to close the edit dialog
  const handleCloseDialog = () => {
    setIsEditDialogVisible(false);
    setSaveError(null);
  };

  // Handler to save the edited notes
  const handleSaveNotes = async () => {
    setIsSaving(true);
    setSaveError(null);

    try {
      // Implement the logic to save the notes.
      // This could be an API call or updating context/state.
      // For example:
      // await updateEnquiryNotes(enquiry.ID, editedNotes);

      // Placeholder for API call
      const response = await fetch(`/api/updateEnquiryNotes/${enquiry.ID}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notes: editedNotes }),
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: Failed to save notes.`);
      }

      // Assuming the API returns the updated enquiry
      const updatedEnquiry: Enquiry = await response.json();

      // Call the parent handler to update notes
      onEditNotes(enquiry.ID, updatedEnquiry.Initial_first_call_notes || '');

      // Close the dialog after successful save
      setIsEditDialogVisible(false);
    } catch (err: any) {
      console.error('Failed to save notes:', err);
      setSaveError(err.message || 'Failed to save notes.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <EnquiryOverview
        enquiry={enquiry}
        onEditRating={onEditRating}
        onEditNotes={handleOpenEditDialog} // Pass the handler to open dialog
      />

      {/* Edit Notes Dialog */}
      <Dialog
        hidden={!isEditDialogVisible}
        onDismiss={handleCloseDialog}
        dialogContentProps={{
          type: DialogType.normal,
          title: 'Edit Enquiry Notes',
          subText: 'Update the notes for this enquiry.',
        }}
        modalProps={{
          isBlocking: false,
          styles: { main: { maxWidth: 450 } },
        }}
      >
        <TextField
          label="Enquiry Notes"
          multiline
          rows={6}
          value={editedNotes}
          onChange={(e, newValue) => setEditedNotes(newValue || '')}
        />
        {saveError && (
          <FluentText
            variant="small"
            styles={{ root: { color: 'red', marginTop: '8px' } }}
          >
            {saveError}
          </FluentText>
        )}
        <DialogFooter>
          <PrimaryButton
            onClick={handleSaveNotes}
            text="Save"
            disabled={isSaving}
          />
          <DefaultButton
            onClick={handleCloseDialog}
            text="Cancel"
            disabled={isSaving}
          />
        </DialogFooter>
      </Dialog>
    </>
  );
};

export default EnquiryNotesEdits;
