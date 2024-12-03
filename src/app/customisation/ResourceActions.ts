// src/app/customisation/ResourceActions.ts

export interface ResourceAction {
    label: string;
    icon: string;
    onClick: (inputs: { [key: string]: string }) => void;
    requiredFields: string[]; // List of required input fields
}

export const resourceActions: { [key: string]: ResourceAction[] } = {
    asana: [
        {
            label: 'Create an Entry',
            icon: 'Add',
            onClick: (inputs) =>
                alert(
                    `Asana: Creating an entry with Name "${inputs.entryName}" and Description "${inputs.description}"...`
                ),
            requiredFields: ['entryName', 'description'],
        },
        {
            label: 'Retrieve an Entry',
            icon: 'Search',
            onClick: (inputs) =>
                alert(`Asana: Retrieving an entry with ID "${inputs.entryId}"...`),
            requiredFields: ['entryId'],
        },
        {
            label: 'Produce Bespoke Link',
            icon: 'Link',
            onClick: (inputs) =>
                alert(
                    `Asana: Producing a bespoke link for entry ID "${inputs.entryId}"...`
                ),
            requiredFields: ['entryId'],
        },
        {
            label: 'Add a Note',
            icon: 'Note',
            onClick: (inputs) =>
                alert(
                    `Asana: Adding a note "${inputs.note}" to entry ID "${inputs.entryId}"...`
                ),
            requiredFields: ['entryId', 'note'],
        },
    ],
    nuclino: [
        {
            label: 'Create an Entry',
            icon: 'Add',
            onClick: (inputs) =>
                alert(
                    `Nuclino: Creating an entry with Title "${inputs.title}" and Content "${inputs.content}"...`
                ),
            requiredFields: ['title', 'content'],
        },
        {
            label: 'Retrieve an Entry',
            icon: 'Search',
            onClick: (inputs) =>
                alert(`Nuclino: Retrieving an entry with ID "${inputs.entryId}"...`),
            requiredFields: ['entryId'],
        },
        {
            label: 'Produce Bespoke Link',
            icon: 'Link',
            onClick: (inputs) =>
                alert(
                    `Nuclino: Producing a bespoke link for entry ID "${inputs.entryId}"...`
                ),
            requiredFields: ['entryId'],
        },
        {
            label: 'Add a Note',
            icon: 'Note',
            onClick: (inputs) =>
                alert(
                    `Nuclino: Adding a note "${inputs.note}" to entry ID "${inputs.entryId}"...`
                ),
            requiredFields: ['entryId', 'note'],
        },
    ],
    clio: [
        {
            label: 'Create an Entry',
            icon: 'Add',
            onClick: (inputs) =>
                alert(
                    `Clio: Creating an entry with Client Name "${inputs.clientName}" and Case "${inputs.case}"...`
                ),
            requiredFields: ['clientName', 'case'],
        },
        {
            label: 'Retrieve an Entry',
            icon: 'Search',
            onClick: (inputs) =>
                alert(`Clio: Retrieving an entry with ID "${inputs.entryId}"...`),
            requiredFields: ['entryId'],
        },
        {
            label: 'Produce Bespoke Link',
            icon: 'Link',
            onClick: (inputs) =>
                alert(
                    `Clio: Producing a bespoke link for entry ID "${inputs.entryId}"...`
                ),
            requiredFields: ['entryId'],
        },
        {
            label: 'Add a Note',
            icon: 'Note',
            onClick: (inputs) =>
                alert(
                    `Clio: Adding a note "${inputs.note}" to entry ID "${inputs.entryId}"...`
                ),
            requiredFields: ['entryId', 'note'],
        },
    ],
    netdocuments: [
        {
            label: 'Create an Entry',
            icon: 'Add',
            onClick: (inputs) =>
                alert(
                    `NetDocuments: Creating an entry with Document Name "${inputs.documentName}" and Content "${inputs.content}"...`
                ),
            requiredFields: ['documentName', 'content'],
        },
        {
            label: 'Retrieve an Entry',
            icon: 'Search',
            onClick: (inputs) =>
                alert(`NetDocuments: Retrieving an entry with ID "${inputs.entryId}"...`),
            requiredFields: ['entryId'],
        },
        {
            label: 'Produce Bespoke Link',
            icon: 'Link',
            onClick: (inputs) =>
                alert(
                    `NetDocuments: Producing a bespoke link for entry ID "${inputs.entryId}"...`
                ),
            requiredFields: ['entryId'],
        },
        {
            label: 'Add a Note',
            icon: 'Note',
            onClick: (inputs) =>
                alert(
                    `NetDocuments: Adding a note "${inputs.note}" to entry ID "${inputs.entryId}"...`
                ),
            requiredFields: ['entryId', 'note'],
        },
    ],
    activecampaign: [
        {
            label: 'Create an Entry',
            icon: 'Add',
            onClick: (inputs) =>
                alert(
                    `ActiveCampaign: Creating an entry with Campaign Name "${inputs.campaignName}" and Description "${inputs.description}"...`
                ),
            requiredFields: ['campaignName', 'description'],
        },
        {
            label: 'Retrieve an Entry',
            icon: 'Search',
            onClick: (inputs) =>
                alert(`ActiveCampaign: Retrieving an entry with ID "${inputs.entryId}"...`),
            requiredFields: ['entryId'],
        },
        {
            label: 'Produce Bespoke Link',
            icon: 'Link',
            onClick: (inputs) =>
                alert(
                    `ActiveCampaign: Producing a bespoke link for entry ID "${inputs.entryId}"...`
                ),
            requiredFields: ['entryId'],
        },
        {
            label: 'Add a Note',
            icon: 'Note',
            onClick: (inputs) =>
                alert(
                    `ActiveCampaign: Adding a note "${inputs.note}" to entry ID "${inputs.entryId}"...`
                ),
            requiredFields: ['entryId', 'note'],
        },
    ],
    bundledocs: [
        {
            label: 'Create an Entry',
            icon: 'Add',
            onClick: (inputs) =>
                alert(
                    `BundleDocs: Creating an entry with Document Title "${inputs.documentTitle}" and Content "${inputs.content}"...`
                ),
            requiredFields: ['documentTitle', 'content'],
        },
        {
            label: 'Retrieve an Entry',
            icon: 'Search',
            onClick: (inputs) =>
                alert(`BundleDocs: Retrieving an entry with ID "${inputs.entryId}"...`),
            requiredFields: ['entryId'],
        },
        {
            label: 'Produce Bespoke Link',
            icon: 'Link',
            onClick: (inputs) =>
                alert(
                    `BundleDocs: Producing a bespoke link for entry ID "${inputs.entryId}"...`
                ),
            requiredFields: ['entryId'],
        },
        {
            label: 'Add a Note',
            icon: 'Note',
            onClick: (inputs) =>
                alert(
                    `BundleDocs: Adding a note "${inputs.note}" to entry ID "${inputs.entryId}"...`
                ),
            requiredFields: ['entryId', 'note'],
        },
    ],
    leapsome: [
        {
            label: 'Create an Entry',
            icon: 'Add',
            onClick: (inputs) =>
                alert(
                    `Leapsome: Creating an entry with Goal "${inputs.goal}" and Description "${inputs.description}"...`
                ),
            requiredFields: ['goal', 'description'],
        },
        {
            label: 'Retrieve an Entry',
            icon: 'Search',
            onClick: (inputs) =>
                alert(`Leapsome: Retrieving an entry with ID "${inputs.entryId}"...`),
            requiredFields: ['entryId'],
        },
        {
            label: 'Produce Bespoke Link',
            icon: 'Link',
            onClick: (inputs) =>
                alert(
                    `Leapsome: Producing a bespoke link for entry ID "${inputs.entryId}"...`
                ),
            requiredFields: ['entryId'],
        },
        {
            label: 'Add a Note',
            icon: 'Note',
            onClick: (inputs) =>
                alert(
                    `Leapsome: Adding a note "${inputs.note}" to entry ID "${inputs.entryId}"...`
                ),
            requiredFields: ['entryId', 'note'],
        },
    ],
    harvey: [
        {
            label: 'Create an Entry',
            icon: 'Add',
            onClick: (inputs) =>
                alert(
                    `Harvey: Creating an entry with Task Name "${inputs.taskName}" and Details "${inputs.details}"...`
                ),
            requiredFields: ['taskName', 'details'],
        },
        {
            label: 'Retrieve an Entry',
            icon: 'Search',
            onClick: (inputs) =>
                alert(`Harvey: Retrieving an entry with ID "${inputs.entryId}"...`),
            requiredFields: ['entryId'],
        },
        {
            label: 'Produce Bespoke Link',
            icon: 'Link',
            onClick: (inputs) =>
                alert(
                    `Harvey: Producing a bespoke link for entry ID "${inputs.entryId}"...`
                ),
            requiredFields: ['entryId'],
        },
        {
            label: 'Add a Note',
            icon: 'Note',
            onClick: (inputs) =>
                alert(
                    `Harvey: Adding a note "${inputs.note}" to entry ID "${inputs.entryId}"...`
                ),
            requiredFields: ['entryId', 'note'],
        },
    ],
    lexisnexis: [
        {
            label: 'Create an Entry',
            icon: 'Add',
            onClick: (inputs) =>
                alert(
                    `LexisNexis: Creating an entry with Case Name "${inputs.caseName}" and Description "${inputs.description}"...`
                ),
            requiredFields: ['caseName', 'description'],
        },
        {
            label: 'Retrieve an Entry',
            icon: 'Search',
            onClick: (inputs) =>
                alert(`LexisNexis: Retrieving an entry with ID "${inputs.entryId}"...`),
            requiredFields: ['entryId'],
        },
        {
            label: 'Produce Bespoke Link',
            icon: 'Link',
            onClick: (inputs) =>
                alert(
                    `LexisNexis: Producing a bespoke link for entry ID "${inputs.entryId}"...`
                ),
            requiredFields: ['entryId'],
        },
        {
            label: 'Add a Note',
            icon: 'Note',
            onClick: (inputs) =>
                alert(
                    `LexisNexis: Adding a note "${inputs.note}" to entry ID "${inputs.entryId}"...`
                ),
            requiredFields: ['entryId', 'note'],
        },
    ],
    thompsonreuters: [
        {
            label: 'Create an Entry',
            icon: 'Add',
            onClick: (inputs) =>
                alert(
                    `Thompson Reuters: Creating an entry with Document Title "${inputs.documentTitle}" and Content "${inputs.content}"...`
                ),
            requiredFields: ['documentTitle', 'content'],
        },
        {
            label: 'Retrieve an Entry',
            icon: 'Search',
            onClick: (inputs) =>
                alert(`Thompson Reuters: Retrieving an entry with ID "${inputs.entryId}"...`),
            requiredFields: ['entryId'],
        },
        {
            label: 'Produce Bespoke Link',
            icon: 'Link',
            onClick: (inputs) =>
                alert(
                    `Thompson Reuters: Producing a bespoke link for entry ID "${inputs.entryId}"...`
                ),
            requiredFields: ['entryId'],
        },
        {
            label: 'Add a Note',
            icon: 'Note',
            onClick: (inputs) =>
                alert(
                    `Thompson Reuters: Adding a note "${inputs.note}" to entry ID "${inputs.entryId}"...`
                ),
            requiredFields: ['entryId', 'note'],
        },
    ],
    landregistry: [
        {
            label: 'Create an Entry',
            icon: 'Add',
            onClick: (inputs) =>
                alert(
                    `Land Registry: Creating an entry with Property Name "${inputs.propertyName}" and Address "${inputs.address}"...`
                ),
            requiredFields: ['propertyName', 'address'],
        },
        {
            label: 'Retrieve an Entry',
            icon: 'Search',
            onClick: (inputs) =>
                alert(`Land Registry: Retrieving an entry with ID "${inputs.entryId}"...`),
            requiredFields: ['entryId'],
        },
        {
            label: 'Produce Bespoke Link',
            icon: 'Link',
            onClick: (inputs) =>
                alert(
                    `Land Registry: Producing a bespoke link for entry ID "${inputs.entryId}"...`
                ),
            requiredFields: ['entryId'],
        },
        {
            label: 'Add a Note',
            icon: 'Note',
            onClick: (inputs) =>
                alert(
                    `Land Registry: Adding a note "${inputs.note}" to entry ID "${inputs.entryId}"...`
                ),
            requiredFields: ['entryId', 'note'],
        },
    ],
    companieshouse: [
        {
            label: 'Create an Entry',
            icon: 'Add',
            onClick: (inputs) =>
                alert(
                    `Companies House: Creating an entry with Company Name "${inputs.companyName}" and Registration Number "${inputs.registrationNumber}"...`
                ),
            requiredFields: ['companyName', 'registrationNumber'],
        },
        {
            label: 'Retrieve an Entry',
            icon: 'Search',
            onClick: (inputs) =>
                alert(`Companies House: Retrieving an entry with ID "${inputs.entryId}"...`),
            requiredFields: ['entryId'],
        },
        {
            label: 'Produce Bespoke Link',
            icon: 'Link',
            onClick: (inputs) =>
                alert(
                    `Companies House: Producing a bespoke link for entry ID "${inputs.entryId}"...`
                ),
            requiredFields: ['entryId'],
        },
        {
            label: 'Add a Note',
            icon: 'Note',
            onClick: (inputs) =>
                alert(
                    `Companies House: Adding a note "${inputs.note}" to entry ID "${inputs.entryId}"...`
                ),
            requiredFields: ['entryId', 'note'],
        },
    ],
};
