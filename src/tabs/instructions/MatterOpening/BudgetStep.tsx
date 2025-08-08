import React from 'react';
import { Stack, TextField } from '@fluentui/react';
import ModernMultiSelect from './ModernMultiSelect';

interface BudgetStepProps {
    budgetRequired: string;
    setBudgetRequired: (v: string) => void;
    budgetAmount: string;
    setBudgetAmount: (v: string) => void;
    threshold: string;
    setThreshold: (v: string) => void;
    notifyUsers: string;
    setNotifyUsers: (v: string) => void;
}

const BudgetStep: React.FC<BudgetStepProps> = ({
    budgetRequired,
    setBudgetRequired,
    budgetAmount,
    setBudgetAmount,
    threshold,
    setThreshold,
    notifyUsers,
    setNotifyUsers
}) => {
    return (
        <Stack tokens={{ childrenGap: 12 }}>
            <ModernMultiSelect
                label="Is a matter budget required for this file?"
                options={[{ key: 'Yes', text: 'Yes' }, { key: 'No', text: 'No' }]}
                selectedValue={budgetRequired}
                onSelectionChange={setBudgetRequired}
                variant="default"
            />
            {budgetRequired === 'Yes' && (
                <>
                    <TextField
                        label="What is the budget?"
                        prefix="£"
                        value={budgetAmount}
                        onChange={(_, v) => setBudgetAmount(v || '')}
                    />
                    <TextField
                        label="Notify when matter budget usage reaches"
                        suffix="%"
                        value={threshold}
                        onChange={(_, v) => setThreshold(v || '')}
                    />
                    <TextField
                        label="Users to notify at threshold"
                        placeholder="Enter emails separated by commas"
                        value={notifyUsers}
                        onChange={(_, v) => setNotifyUsers(v || '')}
                    />
                </>
            )}
        </Stack>
    );
};

export default BudgetStep;

