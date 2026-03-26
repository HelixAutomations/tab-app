import React from 'react';
// invisible change 2
import { IconButton } from '@fluentui/react/lib/Button';
import type { IButtonProps } from '@fluentui/react/lib/Button';
import { Icon } from '@fluentui/react/lib/Icon';
interface ActionIconButtonProps extends IButtonProps {
    outlineIcon: string;
    filledIcon?: string;
    title?: string;
}

const ActionIconButton: React.FC<ActionIconButtonProps> = ({ outlineIcon, filledIcon, ...props }) => (
    <IconButton
        {...props}
        onRenderIcon={() => (
            <span className="icon-hover">
                <Icon iconName={outlineIcon} className="icon-outline" />
                <Icon iconName={filledIcon || outlineIcon} className="icon-filled" />
            </span>
        )}
    />
);

export default ActionIconButton;