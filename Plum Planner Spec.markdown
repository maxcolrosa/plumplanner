# Plum Planner Spec

## Overview
The aim of Plum Planner (PP) is to make the everyday planning of simple projects and teams as quick and painless as possible. It is not designed to do everything a full blown project management tool such as Microsoft Project can do and therefore should not be compared with such. The idea is to provide enough to allow your typical small project or team to be managed quickly and have a good approximation of what is going on. It works on the basis that planning is not an exact science and that tasks or activities can not be planned to a great accuracy, and that the further out you plan the less accurate you get. The focus is on looking at the outstanding work allocated to people.

Throughout the program, we will use convention-over-configuration to allow a typical user to get going as quickly as possible without having to do extensive setup.

## Resources
These are the fundamental entities that are planned and typically they tend to be people, however, they could also be something such as a room or piece of equipment, in which case you would have to allocated Fixed (see below) tasks only for it to make any sense.

### Resource Attributes
* Name
* Email (optional)
* Working week
  * Mon-Sun, select full, 3/4, half, 1/4 or 0
* Icon - person, image, room?
* Collection of Tasks
  * Fixed, Completed and Incompleted  
    It may be necessary to break down Fixed tasks to completed and incomplete. 


## Tasks
These are the units of work, or activities allocated to a resource. They are the things that occupy time in resources day. For a person it's something like 'Prepare presentation' and for a room, it could be something like 'Introduction to Agile Development'.

Plum Planner sits somewhere between a conventional project planning tool and a 'To Do' list. You can consider each resource having a stack of tasks. You add tasks on to the top of your pile and pull out tasks from the bottom. So once a task is complete (removed from the bottom of the stack), the next task falls into place. However, life if littered with tasks that need to be done at a fixed time e.g. attend a training course on 14th-16th March. In such cases these tasks remain in the stack at a fixed (time) location, and other tasks can flow around them.

Most planning tools allow you to create dependencies between tasks, so for example task B can not start before task A is complete. This is a desirable feature to have and is on the roadmap, but is not in the initial version.

PP is a planning tool - it is not a time tracking system i.e. its purpose is to plan ahead, and not track hours for timesheet purposes etc. It is intended in the future that actual hours can be attributed to a task so actuals/estimates can be examined.

### Task Attributes
* Name
* Resource
* Type - Fixed or Fluid
* Start Date
* Duration - in working-hours  
  So a 4 day task would last two calendar weeks if the person only worked a 2-day week
* Tags (0 or more)


#### Fluid Task Attributes
* Actual Duration  
  This is the time the actual task took, rather than any estimates. 
* Constraints - see below


#### Fixed Task Attributes
?? Are any additional attributes needed for fixed tasks.


#### Task Constraints
Tasks can have constraints - initially, they will be considered as 'soft' constraints i.e. a task insertion/removal process will allow the constraint to be broken, but will be highlighted in the GUI. It would be a good idea for the engine to be able to highlight that a constraint has been broken and identify the nature of the break.  The following are the most common constraints.

1. Task can't start before given date e.g. supplier dependency
2. Task can't start before a given task/tasks e.g. build depends on design
3. Task can't finish beyond a given date e.g. milestone
4. Task can't be split - not sure about this one is needed.

#### Tags or Labels
Tags are simple text labels that can be applied to tasks. Tags simply are a name and a colour. A task can have zero or more tags. Tags will be used to filter tasks - this may not be in the initial version.


### Task Movement Rules

1. An Task can never be inserted in or over another Fixed Task.
2. When a task is inserted, it is assumed that it has the priority, so all other Fluid Tasks are pushed to the future, closing gaps if necessary and flowing them around any Fixed Tasks. If a fluid task is inserted onto another fluid task it assumes that the original task is split at the insertion point and pushed to the future to recommence where the new tasks ends. 
3. When a task is deleted, initially tasks in the future remain in place, until the 'compress' action is triggered. This includes gaps in a task that was previously split.
4. Compress is the action of flowing all tasks from the future in to gaps earlier in the schedule, however, it defaults to only doing this for tasks from 'now' i.e. it will not fill gaps left earlier than now. It will be possible to trigger a compress from a given date if necessary.
5. A tasks that is adjusted i.e. has its start date changed or its duration changed, should be considered as a delete operation followed by an insert.


## User Interface Components

Insert a task - tool palette
Remove task
Compact (all/user) -> from date/now
Highlight tasks at risk
Distribute - PDF/email/print
Resource settings

