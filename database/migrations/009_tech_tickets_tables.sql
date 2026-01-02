-- Migration: Create tech_ideas and tech_problems tables
-- Date: 2025-12-30
-- Database: helix_projects (or PROJECTS_SQL_CONNECTION_STRING target)

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'tech_ideas')
BEGIN
    CREATE TABLE tech_ideas (
        id INT IDENTITY(1,1) PRIMARY KEY,
        created_at DATETIME2 DEFAULT GETUTCDATE(),
        submitted_by NVARCHAR(10),

        title NVARCHAR(200) NOT NULL,
        description NVARCHAR(MAX) NOT NULL,
        priority NVARCHAR(20) NOT NULL,
        area NVARCHAR(50) NOT NULL,

        status NVARCHAR(30) DEFAULT 'submitted',
        error_code NVARCHAR(100),
        error_message NVARCHAR(1000)
    );

    CREATE INDEX IX_tech_ideas_created_at ON tech_ideas(created_at);
    CREATE INDEX IX_tech_ideas_status ON tech_ideas(status);

    PRINT 'Created tech_ideas table';
END
ELSE
BEGIN
    PRINT 'tech_ideas table already exists';
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'tech_problems')
BEGIN
    CREATE TABLE tech_problems (
        id INT IDENTITY(1,1) PRIMARY KEY,
        created_at DATETIME2 DEFAULT GETUTCDATE(),
        submitted_by NVARCHAR(10),

        system NVARCHAR(50) NOT NULL,
        summary NVARCHAR(500) NOT NULL,
        steps_to_reproduce NVARCHAR(MAX),
        expected_vs_actual NVARCHAR(MAX) NOT NULL,
        urgency NVARCHAR(20) NOT NULL,

        status NVARCHAR(30) DEFAULT 'submitted',
        error_code NVARCHAR(100),
        error_message NVARCHAR(1000)
    );

    CREATE INDEX IX_tech_problems_created_at ON tech_problems(created_at);
    CREATE INDEX IX_tech_problems_status ON tech_problems(status);

    PRINT 'Created tech_problems table';
END
ELSE
BEGIN
    PRINT 'tech_problems table already exists';
END
GO
